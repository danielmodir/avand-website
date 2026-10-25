<?php
/* Admin panel: accounts (users.view / users.manage) and the database
 * backup (owner only). Admins see account facts and usage numbers, never
 * what people wrote: no tasks, habits, events or period data. Every
 * change is written to the audit log. */
declare(strict_types=1);

const TJ_ADMIN_PAGE = 50;

/* Which kind of device a sign-in came from, by the browser string kept on
 * each session (tj_sessions.user_agent; a session is renewed about every
 * hour, so the newest one is where the person is now): the Android app
 * (its WebView adds "ToojibeeAndroid/<version>", android/.../AppWeb.kt),
 * a phone's browser, or a computer. */
const TJ_SQL_APP = "user_agent LIKE '%ToojibeeAndroid/%'";
const TJ_SQL_PHONE = "(user_agent LIKE '%Mobi%' OR user_agent LIKE '%Android%' OR user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%')";
const TJ_DEVICE_DAYS = 30;

function tj_device_of(string $ua): array {
    if (preg_match('#ToojibeeAndroid/([\w.]+)#', $ua, $m)) return ['kind' => 'app', 'app_version' => $m[1]];
    return ['kind' => preg_match('/Mobi|Android|iPhone|iPad/i', $ua) ? 'phone' : 'desktop', 'app_version' => null];
}

/* For a page of users: the device of each one's newest sign-in, and
 * whether they've used the app at all lately. */
function tj_admin_user_devices(array $userIds): array {
    if (!$userIds) return [];
    $in = implode(',', array_fill(0, count($userIds), '?'));
    $q = tj_db()->prepare("SELECT user_id, user_agent FROM tj_sessions WHERE user_id IN ($in) AND created_at >= ? ORDER BY created_at");
    $q->execute(array_merge($userIds, [tj_now(-TJ_DEVICE_DAYS * 86400)]));
    $out = [];
    foreach ($q->fetchAll() as $s) {
        $d = tj_device_of((string)$s['user_agent']);
        $o = $out[$s['user_id']] ?? ['device' => null, 'app_version' => null, 'uses_app' => false];
        $o['device'] = $d['kind'];                       // newest last
        if ($d['kind'] === 'app') { $o['uses_app'] = true; $o['app_version'] = $d['app_version']; }
        $out[$s['user_id']] = $o;
    }
    return $out;
}

/* Connect to AI (lib/mcp.php): for a page of users, who has a personal MCP
 * link and when an AI app last used it. Only that: never what it did. */
function tj_admin_user_ai(array $userIds): array {
    if (!$userIds) return [];
    $in = implode(',', array_fill(0, count($userIds), '?'));
    $q = tj_db()->prepare("SELECT user_id, created_at, last_used_at FROM tj_mcp_keys WHERE user_id IN ($in)");
    $q->execute($userIds);
    $out = [];
    foreach ($q->fetchAll() as $k) $out[$k['user_id']] = ['ai_linked' => true, 'ai_linked_at' => $k['created_at'], 'ai_last_used_at' => $k['last_used_at']];
    return $out;
}

const TJ_AI_NONE = ['ai_linked' => false, 'ai_linked_at' => null, 'ai_last_used_at' => null];

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
 *   device       app | phone | desktop: signed in from it in the last 30 days
 *   ai           linked (has an MCP link) | used (an AI app used it in 30 days) | none
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
    $dev = (string)($src['device'] ?? '');
    $kinds = ['app' => TJ_SQL_APP, 'phone' => '(NOT ' . TJ_SQL_APP . ' AND ' . TJ_SQL_PHONE . ')', 'desktop' => '(NOT ' . TJ_SQL_APP . ' AND NOT ' . TJ_SQL_PHONE . ')'];
    if (isset($kinds[$dev])) {
        $where[] = "id IN (SELECT user_id FROM tj_sessions WHERE {$kinds[$dev]} AND created_at >= ?)";
        $args[] = tj_now(-TJ_DEVICE_DAYS * 86400);
    }
    $ai = (string)($src['ai'] ?? '');
    if ($ai === 'linked') $where[] = 'id IN (SELECT user_id FROM tj_mcp_keys)';
    if ($ai === 'used') { $where[] = 'id IN (SELECT user_id FROM tj_mcp_keys WHERE last_used_at >= ?)'; $args[] = tj_now(-30 * 86400); }
    if ($ai === 'none') $where[] = 'id NOT IN (SELECT user_id FROM tj_mcp_keys)';
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
    $rows = $s->fetchAll();
    $ids = array_map(function ($u) { return (int)$u['id']; }, $rows);
    $devices = tj_admin_user_devices($ids);
    $ai = tj_admin_user_ai($ids);
    $none = ['device' => null, 'app_version' => null, 'uses_app' => false];
    tj_json(['total' => (int)$c->fetch()['n'], 'offset' => $offset, 'page' => TJ_ADMIN_PAGE, 'items' => array_map(function ($u) use ($personal, $devices, $none, $ai) {
        return tj_admin_user_row($u) + tj_admin_user_birth($u, $personal) + ($devices[(int)$u['id']] ?? $none) + ($ai[(int)$u['id']] ?? TJ_AI_NONE);
    }, $rows), 'personal' => $personal]);
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
        // Each signed-in device with its kind (app + version, phone, computer).
        'devices' => array_map(function ($dv) { return $dv + tj_device_of((string)$dv['user_agent']); }, $s->fetchAll()),
    ] + (tj_admin_user_devices([(int)$u['id']])[(int)$u['id']] ?? ['device' => null, 'app_version' => null, 'uses_app' => false])
      + (tj_admin_user_ai([(int)$u['id']])[(int)$u['id']] ?? TJ_AI_NONE));
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
