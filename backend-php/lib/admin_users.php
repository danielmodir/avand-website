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

/* The exact birth day and age: only with users.personal. */
function tj_admin_user_birth(array $u, bool $personal): array {
    if (!$personal || empty($u['birth_date'])) return [];
    $b = new DateTime($u['birth_date']);
    return ['birth_date' => $u['birth_date'], 'age' => $b->diff(new DateTime('today'))->y];
}

/* Which accounts a filter means, as [where SQL, args]. Shared by the
 * users list and messages to a group of users (lib/notices.php).
 *   q            email, username or TJ- code
 *   filter       all | online | suspended
 *   gender       female | male | none (not set)
 *   joined_from, joined_to     sign-up date, YYYY-MM-DD (inclusive)
 *   active_days  seen in the app in the last N days
 *   inactive_days  not seen for N days (or never)
 *   verified     yes | no (email)
 * With users.personal only (they reveal the birth date):
 *   age_min, age_max     whole years today
 *   born_from, born_to   birth date, YYYY-MM-DD */
function tj_admin_user_where(array $src, bool $personal): array {
    $where = []; $args = [];
    $date = function (string $k) use ($src): ?string { $v = (string)($src[$k] ?? ''); return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null; };
    $int = function (string $k) use ($src): ?int { $v = $src[$k] ?? ''; return $v === '' || !is_numeric($v) ? null : max(0, min(150, (int)$v)); };
    $q = trim((string)($src['q'] ?? ''));
    if ($q !== '') {
        $code = strtoupper(preg_replace('/^TJ-?/i', '', $q));
        $where[] = '(email LIKE ? OR username LIKE ? OR display_id = ?)';
        $like = '%' . strtolower($q) . '%'; // admins may use % and _ as wildcards
        array_push($args, $like, $like, $code);
    }
    $filter = (string)($src['filter'] ?? 'all');
    if ($filter === 'online') { $where[] = 'last_seen_at >= ?'; $args[] = tj_now(-TJ_ONLINE_WINDOW); }
    if ($filter === 'suspended') $where[] = "status = 'suspended'";
    $g = (string)($src['gender'] ?? '');
    if ($g === 'female' || $g === 'male') { $where[] = 'gender = ?'; $args[] = $g; }
    if ($g === 'none') $where[] = "(gender IS NULL OR gender = '')";
    if ($d = $date('joined_from')) { $where[] = 'created_at >= ?'; $args[] = "$d 00:00:00"; }
    if ($d = $date('joined_to')) { $where[] = 'created_at <= ?'; $args[] = "$d 23:59:59"; }
    if (($n = $int('active_days')) !== null) { $where[] = 'last_seen_at >= ?'; $args[] = tj_now(-$n * 86400); }
    if (($n = $int('inactive_days')) !== null) { $where[] = '(last_seen_at IS NULL OR last_seen_at < ?)'; $args[] = tj_now(-$n * 86400); }
    $v = (string)($src['verified'] ?? '');
    if ($v === 'yes') $where[] = 'email_verified_at IS NOT NULL';
    if ($v === 'no') $where[] = 'email_verified_at IS NULL';
    if ($personal) {
        $today = new DateTime('today');
        if (($n = $int('age_min')) !== null) { $where[] = 'birth_date <= ?'; $args[] = (clone $today)->modify("-$n years")->format('Y-m-d'); }
        if (($n = $int('age_max')) !== null) { $where[] = 'birth_date > ?'; $args[] = (clone $today)->modify('-' . ($n + 1) . ' years')->format('Y-m-d'); }
        if ($d = $date('born_from')) { $where[] = 'birth_date >= ?'; $args[] = $d; }
        if ($d = $date('born_to')) { $where[] = 'birth_date <= ?'; $args[] = $d; }
    }
    return [$where ? ' WHERE ' . implode(' AND ', $where) : '', $args];
}

/* GET /admin/users?<filters above>&offset= */
function tj_admin_users(): void {
    $me = tj_admin_require('users.view');
    $personal = tj_admin_has($me, 'users.personal');
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    [$sqlWhere, $args] = tj_admin_user_where($_GET, $personal);
    $db = tj_db();
    $c = $db->prepare("SELECT COUNT(*) AS n FROM tj_users$sqlWhere");
    $c->execute($args);
    $s = $db->prepare("SELECT * FROM tj_users$sqlWhere ORDER BY created_at DESC LIMIT " . TJ_ADMIN_PAGE . " OFFSET $offset");
    $s->execute($args);
    tj_json(['total' => (int)$c->fetch()['n'], 'offset' => $offset, 'page' => TJ_ADMIN_PAGE, 'items' => array_map(function ($u) use ($personal) { return tj_admin_user_row($u) + tj_admin_user_birth($u, $personal); }, $s->fetchAll()), 'personal' => $personal]);
}

function tj_admin_user_detail(string $publicId): void {
    $me = tj_admin_require('users.view');
    $u = tj_admin_find_user($publicId);
    $db = tj_db();
    $s = $db->prepare('SELECT user_agent, created_at, last_used_at FROM tj_sessions WHERE user_id = ? AND revoked_at IS NULL AND refresh_expires > ? ORDER BY last_used_at DESC');
    $s->execute([$u['id'], tj_now()]);
    $d = $db->prepare('SELECT version, updated_at, LENGTH(data) AS bytes FROM tj_user_data WHERE user_id = ?');
    $d->execute([$u['id']]);
    $data = $d->fetch() ?: ['version' => 0, 'updated_at' => null, 'bytes' => 0];
    tj_json(tj_admin_user_row($u) + [
        'gender' => $u['gender'],
        'birth_year' => $u['birth_date'] ? (int)substr($u['birth_date'], 0, 4) : null,
    ] + tj_admin_user_birth($u, tj_admin_has($me, 'users.personal')) + [
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
    $me = tj_admin_require('users.delete');
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
    if (!tj_admin_has($me, 'system.backup')) tj_fail(403, 'forbidden');
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
