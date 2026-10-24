<?php
/* Messages from the team to users ("پیام به کاربرها" in the admin panel,
 * permission users.message): to one account, to everyone, or to the
 * accounts a users-list filter matches (tj_admin_user_where). Each
 * recipient gets a row; the app shows unread ones as a popup on opening
 * and keeps them under Profile → Messages. People with reminders on get
 * it as a push notification too (lib/push.php's queue, sent by the cron).
 *
 *   GET  /me/notices                  mine, newest first, with seen
 *   POST /me/notices/seen             {ids: [...]} or {} for all
 *   GET  /admin/notices               sent messages, with how many saw them
 *   GET  /admin/notices/preview       ?<filters>: how many would get it
 *   POST /admin/notices               {title, body, to: user|all|filter, user, filters, push} */
declare(strict_types=1);

const TJ_NOTICE_TITLE = 120;
const TJ_NOTICE_BODY = 2000;

function tj_notice_row(array $n): array {
    return ['id' => $n['public_id'], 'title' => $n['title'], 'body' => $n['body'], 'created_at' => $n['created_at'], 'seen' => $n['seen_at'] !== null];
}

/* ---- the app ---- */

function tj_notices_mine(): void {
    $me = tj_require_user();
    $q = tj_db()->prepare('SELECT n.public_id, n.title, n.body, n.created_at, r.seen_at FROM tj_notice_recipients r JOIN tj_notices n ON n.id = r.notice_id
                           WHERE r.user_id = ? ORDER BY n.created_at DESC LIMIT 50');
    $q->execute([$me['id']]);
    tj_json(array_map('tj_notice_row', $q->fetchAll()));
}

function tj_notices_seen(): void {
    $me = tj_require_user();
    $ids = tj_body()['ids'] ?? null;
    $db = tj_db();
    if (is_array($ids) && $ids) {
        $ids = array_values(array_filter($ids, function ($x) { return is_string($x) && preg_match('/^[a-f0-9]{32}$/', $x); }));
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $db->prepare("UPDATE tj_notice_recipients SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL AND notice_id IN (SELECT id FROM tj_notices WHERE public_id IN ($in))")
               ->execute(array_merge([tj_now(), $me['id']], $ids));
        }
    } else {
        $db->prepare('UPDATE tj_notice_recipients SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL')->execute([tj_now(), $me['id']]);
    }
    tj_json(['ok' => true]);
}

/* ---- the admin panel ---- */

/* [where, args] for who gets it; 'user' is one public id. */
function tj_notice_audience(array $me, array $b): array {
    $to = (string)($b['to'] ?? '');
    if ($to === 'user') {
        $pid = (string)($b['user'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $pid)) tj_fail(400, 'validation_error', ['fields' => ['user' => ['required']]]);
        return [' WHERE public_id = ?', [$pid]];
    }
    if ($to === 'all') return ['', []];
    if ($to === 'filter') return tj_admin_user_where(is_array($b['filters'] ?? null) ? $b['filters'] : [], tj_admin_has($me, 'users.personal'));
    tj_fail(400, 'validation_error', ['fields' => ['to' => ['required']]]);
}

function tj_admin_notice_preview(): void {
    $me = tj_admin_require('users.message');
    [$where, $args] = tj_admin_user_where($_GET, tj_admin_has($me, 'users.personal'));
    $q = tj_db()->prepare("SELECT COUNT(*) AS n FROM tj_users$where");
    $q->execute($args);
    tj_json(['count' => (int)$q->fetch()['n']]);
}

function tj_admin_notice_send(): void {
    $me = tj_admin_require('users.message');
    $b = tj_body();
    $title = tj_str($b, 'title', TJ_NOTICE_TITLE);
    $body = tj_str($b, 'body', TJ_NOTICE_BODY);
    $fields = [];
    if ($title === '') $fields['title'] = ['required'];
    if ($body === '') $fields['body'] = ['required'];
    if ($fields) tj_fail(400, 'validation_error', ['fields' => $fields]);
    [$where, $args] = tj_notice_audience($me, $b);
    // Only active accounts get it.
    $where = $where === '' ? " WHERE status = 'active'" : $where . " AND status = 'active'";
    $db = tj_db();
    $pid = tj_new_public_id();
    $to = (string)$b['to'];
    tj_tx_begin($db);
    try {
        $db->prepare('INSERT INTO tj_notices (public_id, title, body, audience, filters, recipients, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
           ->execute([$pid, $title, $body, $to, json_encode($b['filters'] ?? null, JSON_UNESCAPED_UNICODE), $me['id'], tj_now()]);
        $nid = (int)$db->lastInsertId();
        $ins = $db->prepare("INSERT INTO tj_notice_recipients (notice_id, user_id) SELECT ?, id FROM tj_users$where");
        $ins->execute(array_merge([$nid], $args));
        $count = $ins->rowCount();
        $db->prepare('UPDATE tj_notices SET recipients = ? WHERE id = ?')->execute([$count, $nid]);
        // As a push notification for those whose browsers are subscribed.
        if (!empty($b['push'])) {
            $db->prepare("INSERT INTO tj_push_queue (user_id, slot, due_at, title, body, data)
                          SELECT DISTINCT r.user_id, ?, ?, ?, ?, ? FROM tj_notice_recipients r JOIN tj_push_subs s ON s.user_id = r.user_id WHERE r.notice_id = ?")
               ->execute(['notice|' . $pid, tj_now(), mb_substr($title, 0, 160), mb_substr($body, 0, 300), json_encode(['kind' => 'notice', 'id' => $pid, 'date' => '']), $nid]);
        }
        tj_tx_commit($db);
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        throw $e;
    }
    tj_admin_audit((int)$me['id'], 'notice_sent', $to . ' · ' . $count . ' · ' . $title);
    tj_json(['ok' => true, 'id' => $pid, 'recipients' => $count], 201);
}

function tj_admin_notices(): void {
    tj_admin_require('users.message');
    $q = tj_db()->query('SELECT n.public_id, n.title, n.body, n.audience, n.recipients, n.created_at, a.email AS sender,
                         (SELECT COUNT(*) FROM tj_notice_recipients r WHERE r.notice_id = n.id AND r.seen_at IS NOT NULL) AS seen
                         FROM tj_notices n LEFT JOIN tj_admins a ON a.id = n.created_by ORDER BY n.created_at DESC LIMIT 50');
    tj_json(array_map(function ($n) {
        return ['id' => $n['public_id'], 'title' => $n['title'], 'body' => $n['body'], 'audience' => $n['audience'], 'recipients' => (int)$n['recipients'],
                'seen' => (int)$n['seen'], 'created_at' => $n['created_at'], 'sender' => $n['sender']];
    }, $q->fetchAll()));
}
