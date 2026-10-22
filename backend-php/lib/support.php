<?php
/* "Contact us" — messages from signed-in people to the team, answered in
 * the admin panel ("پیام کاربرها", permission support.reply). The answer
 * shows in the app under the person's own messages and is emailed to them
 * from support@toojibee.ir. Canned replies (one tap fills the answer) are
 * kept in tj_content and edited from the panel.
 *
 *   POST /support/messages          {kind, body, app_info}
 *   GET  /support/messages          mine, newest first (marks answers seen)
 *   GET  /support/unread            {count} answers not seen yet
 *   GET  /admin/messages            ?status=open|answered|closed|all&offset=
 *   POST /admin/messages/<id>/reply {reply}
 *   POST /admin/messages/<id>/close | /reopen
 *   GET|PUT /admin/messages/canned  [{title, text}] */
declare(strict_types=1);

const TJ_SUPPORT_KINDS = ['suggestion', 'criticism', 'support', 'bug', 'account', 'other'];
const TJ_SUPPORT_MAX = 3000;
const TJ_SUPPORT_PAGE = 30;

function tj_support_row(array $m, bool $admin = false): array {
    $out = [
        'id' => $m['public_id'], 'kind' => $m['kind'], 'body' => $m['body'], 'status' => $m['status'],
        'reply' => $m['reply'], 'replied_at' => $m['replied_at'], 'created_at' => $m['created_at'],
    ];
    if ($admin) {
        $out += [
            'lang' => $m['lang'], 'app_info' => $m['app_info'],
            'user' => ['id' => $m['u_public_id'], 'code' => 'TJ-' . $m['u_display_id'], 'username' => $m['u_username'], 'email' => $m['u_email'],
                       'joined' => $m['u_created_at'], 'verified' => $m['u_verified'] !== null],
            'replied_by' => $m['a_email'] ?? null, 'seen' => $m['user_seen_at'] !== null,
        ];
    }
    return $out;
}

/* ---- the app ---- */

function tj_support_send(): void {
    $me = tj_require_user();
    $b = tj_body();
    $kind = tj_str($b, 'kind', 20);
    $body = tj_str($b, 'body', TJ_SUPPORT_MAX);
    $len = function_exists('mb_strlen') ? mb_strlen($body) : strlen($body);
    $fields = [];
    if (!in_array($kind, TJ_SUPPORT_KINDS, true)) $fields['kind'] = ['required'];
    if ($len < 5) $fields['body'] = ['too_short'];
    if ($fields) tj_fail(400, 'validation_error', ['fields' => $fields]);
    tj_throttle('support', (string)$me['id'], 10, 86400);
    $pid = tj_new_public_id();
    $lang = tj_str($b, 'lang', 2) === 'en' ? 'en' : 'fa';
    tj_db()->prepare('INSERT INTO tj_messages (public_id, user_id, kind, body, lang, app_info, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$pid, $me['id'], $kind, $body, $lang, tj_str($b, 'app_info', 300), 'open', tj_now(), tj_now()]);
    $q = tj_db()->prepare('SELECT * FROM tj_messages WHERE public_id = ?');
    $q->execute([$pid]);
    tj_json(tj_support_row($q->fetch()), 201);
}

function tj_support_mine(): void {
    $me = tj_require_user();
    $db = tj_db();
    $q = $db->prepare('SELECT * FROM tj_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    $q->execute([$me['id']]);
    $rows = array_map('tj_support_row', $q->fetchAll());
    $db->prepare('UPDATE tj_messages SET user_seen_at = ? WHERE user_id = ? AND reply IS NOT NULL AND user_seen_at IS NULL')->execute([tj_now(), $me['id']]);
    tj_json($rows);
}

function tj_support_unread(): void {
    $me = tj_require_user();
    $q = tj_db()->prepare('SELECT COUNT(*) AS n FROM tj_messages WHERE user_id = ? AND reply IS NOT NULL AND user_seen_at IS NULL');
    $q->execute([$me['id']]);
    tj_json(['count' => (int)$q->fetch()['n']]);
}

/* ---- the admin panel ---- */

const TJ_SUPPORT_CANNED_DEFAULT = [
    ['title' => 'تشکر از پیشنهاد', 'text' => "سلام، ممنون که وقت گذاشتی و پیشنهادت رو برامون فرستادی. ثبتش کردیم و تو برنامه‌ریزی نسخه‌های بعدی حتماً بررسیش می‌کنیم.\nتیم توجیبی"],
    ['title' => 'تشکر از انتقاد', 'text' => "سلام، ممنون از صراحتت. انتقادت رو جدی گرفتیم و تیم داره روش کار می‌کنه. اگه جزئیات بیشتری داری خوشحال می‌شیم بشنویم.\nتیم توجیبی"],
    ['title' => 'مشکل بررسی شد', 'text' => "سلام، مشکلی که گفتی رو بررسی کردیم و برطرف شد. لطفاً برنامه رو یه بار ببند و دوباره باز کن. اگه باز هم پیش اومد، همین‌جا خبرمون کن.\nتیم توجیبی"],
    ['title' => 'در حال بررسی', 'text' => "سلام، پیامت رسید و در حال بررسیه. به‌زودی نتیجه رو همین‌جا بهت می‌گیم.\nتیم توجیبی"],
    ['title' => 'جزئیات بیشتر', 'text' => "سلام، برای اینکه بهتر بتونیم کمکت کنیم، لطفاً بگو مشکل دقیقاً کجا و بعد از چه کاری پیش اومد، و از گوشی استفاده می‌کنی یا کامپیوتر.\nتیم توجیبی"],
    ['title' => 'فراموشی رمز', 'text' => "سلام، تو صفحه‌ی ورود روی «رمزت رو فراموش کردی؟» بزن و ایمیلت رو وارد کن؛ یه کد ۶ رقمی از support@toojibee.ir برات میاد. اگه نیومد، پوشه‌ی اسپم رو هم نگاه کن.\nتیم توجیبی"],
];

function tj_admin_messages(): void {
    tj_admin_require('support.reply');
    $status = (string)($_GET['status'] ?? 'open');
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $where = in_array($status, ['open', 'answered', 'closed'], true) ? 'WHERE m.status = ?' : '';
    $args = $where ? [$status] : [];
    $db = tj_db();
    $q = $db->prepare("SELECT m.*, u.public_id AS u_public_id, u.display_id AS u_display_id, u.username AS u_username, u.email AS u_email,
                              u.created_at AS u_created_at, u.email_verified_at AS u_verified, a.email AS a_email
                       FROM tj_messages m JOIN tj_users u ON u.id = m.user_id LEFT JOIN tj_admins a ON a.id = m.replied_by
                       $where ORDER BY m.created_at DESC LIMIT " . (TJ_SUPPORT_PAGE + 1) . " OFFSET $offset");
    $q->execute($args);
    $rows = $q->fetchAll();
    $counts = ['open' => 0, 'answered' => 0, 'closed' => 0];
    foreach ($db->query('SELECT status, COUNT(*) AS n FROM tj_messages GROUP BY status')->fetchAll() as $c) $counts[$c['status']] = (int)$c['n'];
    tj_json(['items' => array_map(function ($m) { return tj_support_row($m, true); }, array_slice($rows, 0, TJ_SUPPORT_PAGE)),
             'more' => count($rows) > TJ_SUPPORT_PAGE, 'counts' => $counts]);
}

function tj_admin_message_find(string $pid): array {
    $q = tj_db()->prepare('SELECT m.*, u.email AS u_email FROM tj_messages m JOIN tj_users u ON u.id = m.user_id WHERE m.public_id = ?');
    $q->execute([$pid]);
    $m = $q->fetch();
    if (!$m) tj_fail(404, 'not_found');
    return $m;
}

function tj_admin_message_action(string $pid, string $action): void {
    $me = tj_admin_require('support.reply');
    $m = tj_admin_message_find($pid);
    $db = tj_db();
    if ($action === 'reply') {
        $reply = tj_str(tj_body(), 'reply', TJ_SUPPORT_MAX);
        if ($reply === '') tj_fail(400, 'reply_required');
        $db->prepare('UPDATE tj_messages SET reply = ?, replied_at = ?, replied_by = ?, status = ?, user_seen_at = NULL, updated_at = ? WHERE id = ?')
            ->execute([$reply, tj_now(), $me['id'], 'answered', tj_now(), $m['id']]);
        tj_support_reply_email($m['u_email'], $m['lang'], $m['body'], $reply);
        tj_admin_audit((int)$me['id'], 'message_replied', $m['u_email']);
    } elseif ($action === 'close' || $action === 'reopen') {
        $status = $action === 'close' ? 'closed' : ($m['reply'] !== null ? 'answered' : 'open');
        $db->prepare('UPDATE tj_messages SET status = ?, updated_at = ? WHERE id = ?')->execute([$status, tj_now(), $m['id']]);
        tj_admin_audit((int)$me['id'], $action === 'close' ? 'message_closed' : 'message_reopened', $m['u_email']);
    }
    tj_json(['ok' => true]);
}

function tj_admin_canned_get(): void {
    tj_admin_require('support.reply');
    $q = tj_db()->prepare("SELECT value FROM tj_content WHERE name = 'support_canned'");
    $q->execute();
    $v = $q->fetch();
    $list = $v ? json_decode((string)$v['value'], true) : null;
    tj_json(is_array($list) ? $list : TJ_SUPPORT_CANNED_DEFAULT);
}

function tj_admin_canned_put(): void {
    $me = tj_admin_require('support.reply');
    $in = tj_body()['items'] ?? null;
    if (!is_array($in)) tj_fail(400, 'validation_error');
    $list = [];
    foreach (array_slice($in, 0, 30) as $it) {
        if (!is_array($it)) continue;
        $title = tj_str($it, 'title', 60); $text = tj_str($it, 'text', TJ_SUPPORT_MAX);
        if ($title !== '' && $text !== '') $list[] = ['title' => $title, 'text' => $text];
    }
    $db = tj_db();
    $json = json_encode($list, JSON_UNESCAPED_UNICODE);
    $db->prepare("DELETE FROM tj_content WHERE name = 'support_canned'")->execute();
    $db->prepare("INSERT INTO tj_content (name, value, updated_at, updated_by) VALUES ('support_canned', ?, ?, ?)")->execute([$json, tj_now(), $me['id']]);
    tj_admin_audit((int)$me['id'], 'canned_saved', (string)count($list));
    tj_json($list);
}

/* The answer, by email too (they may not open the app for a while). */
function tj_support_reply_email(string $to, string $lang, string $question, string $reply): void {
    $fa = $lang !== 'en';
    $subject = $fa ? 'پاسخ تیم توجیبی به پیامت' : 'Toojibee replied to your message';
    $lead = $fa ? 'سلام! تیم توجیبی به پیامت جواب داد:' : 'Hi! The Toojibee team replied to your message:';
    $yours = $fa ? 'پیام تو:' : 'Your message:';
    $foot = $fa ? 'این جواب تو برنامه هم، بخش «ارتباط با ما»، هست. برای پیام جدید از همون‌جا بنویس.'
                : 'You can also read it in the app, under "Contact us". Write a new message from there.';
    $text = "$lead\n\n$reply\n\n— — —\n$yours\n$question\n\n$foot\n\nToojibee · toojibee.ir\n";
    $h = function (string $s): string { return nl2br(htmlspecialchars($s, ENT_QUOTES, 'UTF-8')); };
    $dir = $fa ? 'rtl' : 'ltr'; $align = $fa ? 'right' : 'left';
    $html = '<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F7F3DA">'
        . '<div dir="' . $dir . '" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;padding:26px 22px;font:15px/1.9 Tahoma,Arial,sans-serif;color:#2E2910;text-align:' . $align . '">'
        . '<div style="text-align:center;margin-bottom:10px"><span style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:50%;background:#2C5745;color:#EBE3A7;font:700 18px/48px Arial,sans-serif">Tj</span></div>'
        . '<p style="margin:0 0 10px">' . $h($lead) . '</p>'
        . '<div style="background:#EBE3A7;border-radius:14px;padding:14px 16px">' . $h($reply) . '</div>'
        . '<p style="margin:18px 0 4px;font-size:13px;color:#6b6440">' . $h($yours) . '</p>'
        . '<div style="border-' . ($fa ? 'right' : 'left') . ':3px solid #EB7D00;padding:2px 12px;font-size:13px;color:#6b6440">' . $h($question) . '</div>'
        . '<p style="margin:18px 0 0;font-size:12px;color:#6b6440">' . $h($foot) . '</p>'
        . '<p style="margin:14px 0 0;text-align:center;font-size:12px;color:#6b6440">توجیبی · Toojibee · <a href="https://toojibee.ir/" style="color:#EB7D00">toojibee.ir</a></p>'
        . '</div></body></html>';
    tj_mail($to, $subject, $text, $html);
}
