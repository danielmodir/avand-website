<?php
/* Admin panel: accounts (users.view / users.manage) and the database
 * backup (owner only). Admins see account facts and usage numbers, never
 * what people wrote: no tasks, habits, events or period data. Every
 * change is written to the audit log. */
declare(strict_types=1);

const TJ_ADMIN_PAGE = 50;

function tj_admin_user_row(array $u): array {
    return [
        'id' => $u['public_id'],
        'code' => 'TJ-' . $u['display_id'],
        'username' => $u['username'],
        'email' => $u['email'],
        'status' => $u['status'],
        'created_at' => $u['created_at'],
        'last_seen_at' => $u['last_seen_at'],
        'online' => $u['last_seen_at'] !== null && $u['last_seen_at'] >= tj_now(-TJ_ONLINE_WINDOW),
    ];
}

function tj_admin_find_user(string $publicId): array {
    $q = tj_db()->prepare('SELECT * FROM tj_users WHERE public_id = ?');
    $q->execute([$publicId]);
    $u = $q->fetch();
    if (!$u) tj_fail(404, 'not_found');
    return $u;
}

/* GET /admin/users?q=&filter=all|online|suspended&offset= */
function tj_admin_users(): void {
    tj_admin_require('users.view');
    $q = trim((string)($_GET['q'] ?? ''));
    $filter = (string)($_GET['filter'] ?? 'all');
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $where = [];
    $args = [];
    if ($q !== '') {
        $code = strtoupper(preg_replace('/^TJ-?/i', '', $q));
        $where[] = '(email LIKE ? OR username LIKE ? OR display_id = ?)';
        $like = '%' . strtolower($q) . '%'; // admins may use % and _ as wildcards
        array_push($args, $like, $like, $code);
    }
    if ($filter === 'online') { $where[] = 'last_seen_at >= ?'; $args[] = tj_now(-TJ_ONLINE_WINDOW); }
    if ($filter === 'suspended') $where[] = "status = 'suspended'";
    $sqlWhere = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $db = tj_db();
    $c = $db->prepare("SELECT COUNT(*) AS n FROM tj_users$sqlWhere");
    $c->execute($args);
    $s = $db->prepare("SELECT * FROM tj_users$sqlWhere ORDER BY created_at DESC LIMIT " . TJ_ADMIN_PAGE . " OFFSET $offset");
    $s->execute($args);
    tj_json(['total' => (int)$c->fetch()['n'], 'offset' => $offset, 'page' => TJ_ADMIN_PAGE, 'items' => array_map('tj_admin_user_row', $s->fetchAll())]);
}

function tj_admin_user_detail(string $publicId): void {
    tj_admin_require('users.view');
    $u = tj_admin_find_user($publicId);
    $db = tj_db();
    $s = $db->prepare('SELECT user_agent, created_at, last_used_at FROM tj_sessions WHERE user_id = ? AND revoked_at IS NULL AND refresh_expires > ? ORDER BY last_used_at DESC');
    $s->execute([$u['id'], tj_now()]);
    $d = $db->prepare('SELECT version, updated_at, LENGTH(data) AS bytes FROM tj_user_data WHERE user_id = ?');
    $d->execute([$u['id']]);
    $data = $d->fetch() ?: ['version' => 0, 'updated_at' => null, 'bytes' => 0];
    tj_json(tj_admin_user_row($u) + [
        'gender' => $u['gender'],
        'birth_date' => $u['birth_date'] ?: null, // the exact day (owner's request, 2026-10-22)
        'birth_year' => $u['birth_date'] ? (int)substr($u['birth_date'], 0, 4) : null,
        'email_verified' => $u['email_verified_at'] !== null,
        'active_seconds' => (int)$u['active_seconds'],
        'saves' => (int)$data['version'],
        'last_save_at' => $data['updated_at'],
        'data_bytes' => (int)$data['bytes'],
        'devices' => $s->fetchAll(),
    ]);
}

function tj_admin_user_suspend(string $publicId): void {
    $me = tj_admin_require('users.manage');
    $u = tj_admin_find_user($publicId);
    $on = (bool)(tj_body()['suspended'] ?? true);
    $db = tj_db();
    $db->prepare('UPDATE tj_users SET status = ?, updated_at = ? WHERE id = ?')->execute([$on ? 'suspended' : 'active', tj_now(), $u['id']]);
    if ($on) $db->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')->execute([tj_now(), $u['id']]);
    tj_admin_audit((int)$me['id'], $on ? 'user_suspended' : 'user_unsuspended', 'TJ-' . $u['display_id'] . ' ' . $u['email']);
    tj_json(['ok' => true]);
}

function tj_admin_user_signout(string $publicId): void {
    $me = tj_admin_require('users.manage');
    $u = tj_admin_find_user($publicId);
    tj_db()->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')->execute([tj_now(), $u['id']]);
    tj_admin_audit((int)$me['id'], 'user_signed_out', 'TJ-' . $u['display_id'] . ' ' . $u['email']);
    tj_json(['ok' => true]);
}

/* Needs the account's email typed back, so a slip of the mouse can't
 * delete anyone. Sessions, tokens and data go with it (ON DELETE CASCADE). */
function tj_admin_user_delete(string $publicId): void {
    $me = tj_admin_require('users.manage');
    $u = tj_admin_find_user($publicId);
    if (strtolower(tj_str(tj_body(), 'confirm_email', 254)) !== $u['email']) tj_fail(400, 'confirm_mismatch');
    tj_db()->prepare('DELETE FROM tj_users WHERE id = ?')->execute([$u['id']]);
    tj_admin_audit((int)$me['id'], 'user_deleted', 'TJ-' . $u['display_id'] . ' ' . $u['email']);
    tj_json(['ok' => true]);
}

/* Owner only: a consistent copy of the whole SQLite database (VACUUM
 * INTO), streamed and removed. Period data inside it stays encrypted;
 * the key (~/toojibee-secrets.php) is not part of it, so keep a copy of
 * that file somewhere safe too. */
function tj_admin_backup(): void {
    tj_admin_gate();
    $me = tj_admin_current();
    if ((int)$me['is_owner'] !== 1) tj_fail(403, 'forbidden');
    if (tj_driver() !== 'sqlite') tj_fail(501, 'not_available');
    tj_throttle('admin_backup', (string)$me['id'], 10, 3600);
    $tmp = tj_data_dir() . '/backup-' . bin2hex(random_bytes(8)) . '.sqlite';
    try {
        tj_db()->exec('VACUUM INTO ' . tj_db()->quote($tmp));
    } catch (PDOException $e) {
        // SQLite before 3.27 has no VACUUM INTO: flush the WAL, copy the file.
        tj_db()->exec('PRAGMA wal_checkpoint(FULL)');
        if (!copy(substr(tj_config()['db_dsn'], 7), $tmp)) tj_fail(500, 'backup_failed');
    }
    tj_admin_audit((int)$me['id'], 'backup_downloaded', round(filesize($tmp) / 1024) . ' KB');
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="toojibee-backup-' . gmdate('Y-m-d-His') . '.sqlite"');
    header('Content-Length: ' . filesize($tmp));
    header('Cache-Control: no-store');
    readfile($tmp);
    @unlink($tmp);
    exit;
}
