<?php
/* Admin panel: database and server (system.view; maintenance is owner
 * only). Everything here is read from the live host at request time:
 * the SQLite file and its tables, this account's disk use, the memory
 * and load the host shows this account (CloudLinux/CageFS limits), PHP
 * limits. Nothing about what users wrote is read. */
declare(strict_types=1);

/* Size of a directory tree, stopping after $maxFiles files (mail or a
 * big cache shouldn't make the page slow). */
function tj_dir_size(string $dir, int $maxFiles = 30000): array {
    $bytes = 0; $files = 0; $partial = false;
    if (!is_dir($dir)) return ['bytes' => 0, 'files' => 0, 'partial' => false];
    try {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::LEAVES_ONLY, RecursiveIteratorIterator::CATCH_GET_CHILD);
        foreach ($it as $f) {
            if ($f->isLink()) continue;
            $bytes += (int)$f->getSize();
            if (++$files >= $maxFiles) { $partial = true; break; }
        }
    } catch (Throwable $e) { $partial = true; }
    return ['bytes' => $bytes, 'files' => $files, 'partial' => $partial];
}

/* /proc/meminfo inside CageFS shows this account's memory limit (LVE),
 * not the whole server's. */
function tj_meminfo(): ?array {
    $raw = @file_get_contents('/proc/meminfo');
    if (!$raw) return null;
    $m = [];
    foreach (['MemTotal', 'MemFree', 'MemAvailable', 'Cached', 'Buffers'] as $k) {
        if (preg_match('/^' . $k . ':\s+(\d+) kB/m', $raw, $x)) $m[$k] = (int)$x[1] * 1024;
    }
    if (!isset($m['MemTotal'])) return null;
    $avail = $m['MemAvailable'] ?? (($m['MemFree'] ?? 0) + ($m['Cached'] ?? 0) + ($m['Buffers'] ?? 0));
    return ['total' => $m['MemTotal'], 'used' => max(0, $m['MemTotal'] - $avail)];
}

function tj_ini_bytes(string $v): int {
    $v = trim($v);
    $n = (int)$v;
    switch (strtolower(substr($v, -1))) { case 'g': $n *= 1024; // fall through
        case 'm': $n *= 1024; // fall through
        case 'k': $n *= 1024; }
    return $n;
}

function tj_admin_system(): void {
    tj_admin_require('system.view');
    $db = tj_db();
    $sqlite = tj_driver() === 'sqlite';
    $one = function (string $sql) use ($db) { return $db->query($sql)->fetch(PDO::FETCH_NUM)[0] ?? null; };

    // Tables: rows, and for SQLite the bytes each one takes (dbstat when the
    // build has it).
    $tables = [];
    $names = $sqlite
        ? $db->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN)
        : $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $sizes = [];
    if ($sqlite) {
        try {
            foreach ($db->query('SELECT name, SUM(pgsize) AS b FROM dbstat GROUP BY name')->fetchAll() as $r) $sizes[$r['name']] = (int)$r['b'];
        } catch (Throwable $e) { /* no dbstat in this SQLite build */ }
    }
    foreach ($names as $t) {
        if (!preg_match('/^[A-Za-z0-9_]+$/', $t)) continue;
        $idx = $sqlite ? $db->query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = '$t'")->fetchColumn() : null;
        $tables[] = ['name' => $t, 'rows' => (int)$one("SELECT COUNT(*) FROM $t"), 'bytes' => $sizes[$t] ?? null, 'indexes' => $idx === null ? null : (int)$idx];
    }

    $dbInfo = ['driver' => tj_driver(), 'schema_version' => (int)$one('SELECT MAX(version) FROM tj_schema')];
    if ($sqlite) {
        $file = substr(tj_config()['db_dsn'], 7);
        $dbInfo += [
            'engine_version' => $one('SELECT sqlite_version()'),
            'file_bytes' => @filesize($file) ?: 0,
            'wal_bytes' => @filesize($file . '-wal') ?: 0,
            'page_size' => (int)$one('PRAGMA page_size'),
            'pages' => (int)$one('PRAGMA page_count'),
            'free_pages' => (int)$one('PRAGMA freelist_count'),
            'journal_mode' => $one('PRAGMA journal_mode'),
        ];
    } else {
        $dbInfo['engine_version'] = $one('SELECT VERSION()');
    }

    // Leftovers that can be cleaned up (see tj_admin_system_cleanup).
    $now = tj_now();
    $stale = [
        'sessions' => (int)$db->query("SELECT COUNT(*) FROM tj_sessions WHERE revoked_at IS NOT NULL OR refresh_expires < '$now'")->fetchColumn(),
        'tokens' => (int)$db->query("SELECT COUNT(*) FROM tj_tokens WHERE used_at IS NOT NULL OR expires_at < '$now'")->fetchColumn(),
        'attempts' => (int)$db->query("SELECT COUNT(*) FROM tj_attempts WHERE created_at < '" . tj_now(-86400) . "'")->fetchColumn(),
        'admin_sessions' => (int)$db->query("SELECT COUNT(*) FROM tj_admin_sessions WHERE revoked_at IS NOT NULL OR created_at < '" . tj_now(-TJ_ADMIN_MAX_AGE) . "'")->fetchColumn(),
    ];

    $home = tj_home();
    $disk = [];
    foreach (['public_html' => 'سایت (public_html)', 'toojibee-data' => 'دیتابیس و داده‌ها', 'logs' => 'لاگ‌ها', 'mail' => 'ایمیل‌ها', 'tmp' => 'فایل‌های موقت'] as $dir => $label) {
        $disk[] = ['name' => $dir, 'label' => $label] + tj_dir_size("$home/$dir");
    }
    $load = function_exists('sys_getloadavg') ? sys_getloadavg() : null;
    $uptime = @file_get_contents('/proc/uptime');

    tj_json([
        'database' => $dbInfo,
        'tables' => $tables,
        'stale' => $stale,
        'disk' => $disk,
        'disk_device' => ['total' => @disk_total_space($home) ?: null, 'free' => @disk_free_space($home) ?: null],
        'memory' => tj_meminfo(),
        'load' => $load ? array_map(function ($x) { return round((float)$x, 2); }, $load) : null,
        'cpus' => ($c = @file_get_contents('/proc/cpuinfo')) ? preg_match_all('/^processor\s*:/m', $c) : null,
        'uptime_seconds' => $uptime ? (int)(float)$uptime : null,
        'php' => [
            'version' => PHP_VERSION,
            'memory_limit' => tj_ini_bytes((string)ini_get('memory_limit')),
            'request_memory_peak' => memory_get_peak_usage(true),
            'upload_max' => tj_ini_bytes((string)ini_get('upload_max_filesize')),
            'post_max' => tj_ini_bytes((string)ini_get('post_max_size')),
            'max_execution' => (int)ini_get('max_execution_time'),
            'extensions' => array_values(array_intersect(['pdo_sqlite', 'pdo_mysql', 'openssl', 'zlib', 'mbstring', 'gd', 'fileinfo', 'curl'], array_map('strtolower', get_loaded_extensions()))),
        ],
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? null,
        'server_time' => tj_now(),
    ]);
}

/* Owner only. Deletes what nobody can use any more (ended sessions,
 * used/expired email links, rate-limit rows older than a day) and lets
 * SQLite tidy up. User data is never touched. */
function tj_admin_system_cleanup(): void {
    tj_admin_gate();
    $me = tj_admin_current();
    if ((int)$me['is_owner'] !== 1) tj_fail(403, 'forbidden');
    $db = tj_db();
    $now = tj_now();
    $n = 0;
    $n += $db->exec("DELETE FROM tj_sessions WHERE revoked_at IS NOT NULL OR refresh_expires < '$now'");
    $n += $db->exec("DELETE FROM tj_tokens WHERE used_at IS NOT NULL OR expires_at < '$now'");
    $n += $db->exec("DELETE FROM tj_attempts WHERE created_at < '" . tj_now(-86400) . "'");
    $n += $db->exec("DELETE FROM tj_admin_sessions WHERE (revoked_at IS NOT NULL OR created_at < '" . tj_now(-TJ_ADMIN_MAX_AGE) . "') AND id <> " . (int)$me['session_id']);
    if (tj_driver() === 'sqlite') {
        $db->exec('PRAGMA optimize');
        $db->exec('VACUUM');
        $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    tj_admin_audit((int)$me['id'], 'db_cleanup', $n . ' rows');
    tj_json(['removed' => $n]);
}

/* Owner only: SQLite's own consistency check. */
function tj_admin_system_check(): void {
    tj_admin_gate();
    $me = tj_admin_current();
    if ((int)$me['is_owner'] !== 1) tj_fail(403, 'forbidden');
    $result = tj_driver() === 'sqlite' ? tj_db()->query('PRAGMA quick_check')->fetchAll(PDO::FETCH_COLUMN) : ['not available'];
    tj_admin_audit((int)$me['id'], 'db_check', implode('; ', array_slice($result, 0, 3)));
    tj_json(['ok' => $result === ['ok'], 'result' => array_slice($result, 0, 20)]);
}
