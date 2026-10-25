<?php
/* Admin panel: site visits, read from the host's own access logs.
 *
 * Nothing is added to the pages (the marketing site keeps making zero
 * extra requests, no cookies, no tracking code). cPanel appends each
 * day's traffic to ~/logs/<domain>-ssl_log-<Mon-YYYY>.gz once per stats
 * run (about daily), so these numbers trail real time by up to a day.
 *
 * Counted: successful GETs of pages (not files, not the API, not the
 * admin panel), without bots; and downloads of the Android app's APK. A "visitor" is one IP + browser per day,
 * counted only as a number: no IP or browser string is stored. The
 * totals are cached in ~/toojibee-data/visits-cache.json and rebuilt
 * when a log file changes (at most once every 10 minutes).
 */
declare(strict_types=1);

const TJ_VISIT_DAYS = 30;
const TJ_VISIT_TZ = 'Asia/Tehran';
const TJ_BOT_RE = '/bot|crawl|spider|slurp|curl|wget|python|httpclient|java\/|go-http|monitor|uptime|headless|lighthouse|preview|facebookexternalhit|scan/i';

function tj_visit_logs(): array {
    $files = glob(tj_home() . '/logs/*ssl_log*.gz') ?: [];
    // This month and the one before cover the 30-day window.
    return array_values(array_filter($files, function ($f) { return filemtime($f) >= time() - 70 * 86400; }));
}

/* A page view we count, or null. */
function tj_visit_page(string $path, string $panelSlug): ?string {
    $path = (string)parse_url($path, PHP_URL_PATH);
    if ($path === '' || strpos($path, '/api/') === 0 || strpos($path, '/assets/') === 0) return null;
    if (strpos(trim($path, '/'), $panelSlug) === 0) return null;            // the admin panel itself
    $last = basename($path);
    if (strpos($last, '.') !== false && !preg_match('/\.html?$/', $last)) return null; // files: js, css, images, json…
    $path = preg_replace('/index\.html?$/', '', $path);
    if (preg_match('#^/demo/.+#', $path)) return null;                      // the app's own partials
    return $path === '' ? '/' : $path;
}

function tj_visit_build(): array {
    $tz = new DateTimeZone(TJ_VISIT_TZ);
    $since = (new DateTime('now', $tz))->modify('-' . (TJ_VISIT_DAYS - 1) . ' days')->format('Y-m-d');
    $slug = tj_admin_settings()['panel_slug'];
    $own = '#^https?://(www\.)?toojibee\.ir#i';
    $days = []; $pages = []; $refs = []; $devices = ['mobile' => 0, 'desktop' => 0]; $seen = []; $latest = null;
    $apkDays = []; $apkVersions = [];
    $re = '/^(\S+) \S+ \S+ \[([^\]]+)\] "(GET|HEAD) (\S+) [^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"/';
    foreach (tj_visit_logs() as $file) {
        $gz = @gzopen($file, 'rb');
        if (!$gz) continue;
        while (($line = gzgets($gz, 16384)) !== false) {
            if (!preg_match($re, $line, $m)) continue;
            if (preg_match(TJ_BOT_RE, $m[7])) continue;
            // The Android app's file from the download page: one download
            // per person per day (a resumed download comes in pieces, 206).
            if ($m[3] === 'GET' && ($m[5] === '200' || $m[5] === '206') && preg_match('#^/download/toojibee-([\d.]+)\.apk#', $m[4], $apk)) {
                $t = DateTime::createFromFormat('d/M/Y:H:i:s O', $m[2]);
                if ($t) {
                    $t->setTimezone($tz);
                    $day = $t->format('Y-m-d');
                    $who = md5('apk|' . $day . '|' . $m[1] . '|' . $m[7]);
                    if ($day >= $since && !isset($seen[$who])) {
                        $seen[$who] = true;
                        $apkDays[$day] = ($apkDays[$day] ?? 0) + 1;
                        $apkVersions[$apk[1]] = ($apkVersions[$apk[1]] ?? 0) + 1;
                    }
                }
                continue;
            }
            if ($m[3] !== 'GET' || ($m[5] !== '200' && $m[5] !== '304')) continue;
            $page = tj_visit_page($m[4], $slug);
            if ($page === null) continue;
            $t = DateTime::createFromFormat('d/M/Y:H:i:s O', $m[2]);
            if (!$t) continue;
            $t->setTimezone($tz);
            $day = $t->format('Y-m-d');
            if ($latest === null || $t > $latest) $latest = clone $t;
            if ($day < $since) continue;
            $days[$day] = $days[$day] ?? ['views' => 0, 'visitors' => 0];
            $days[$day]['views']++;
            $who = md5($day . '|' . $m[1] . '|' . $m[7]);   // only kept in memory, to count once
            if (!isset($seen[$who])) {
                $seen[$who] = true;
                $days[$day]['visitors']++;
                $devices[preg_match('/Mobi|Android|iPhone|iPad/i', $m[7]) ? 'mobile' : 'desktop']++;
            }
            $pages[$page] = ($pages[$page] ?? 0) + 1;
            $ref = $m[6];
            if ($ref !== '-' && $ref !== '' && !preg_match($own, $ref)) {
                $host = strtolower((string)parse_url($ref, PHP_URL_HOST));
                if ($host !== '') $refs[$host] = ($refs[$host] ?? 0) + 1;
            }
        }
        gzclose($gz);
    }
    // Every day in the window, zero if nobody came.
    $series = [];
    $d = new DateTime($since, $tz);
    for ($i = 0; $i < TJ_VISIT_DAYS; $i++) {
        $k = $d->format('Y-m-d');
        $series[] = ['day' => $k] + ($days[$k] ?? ['views' => 0, 'visitors' => 0]) + ['apk' => $apkDays[$k] ?? 0];
        $d->modify('+1 day');
    }
    arsort($pages); arsort($refs);
    $top = function (array $a): array { $o = []; foreach (array_slice($a, 0, 15, true) as $k => $v) $o[] = ['name' => (string)$k, 'count' => $v]; return $o; };
    return [
        'days' => $series, 'pages' => $top($pages), 'referrers' => $top($refs), 'devices' => $devices,
        'apk_versions' => $top($apkVersions),
        'data_until' => $latest ? $latest->format('Y-m-d H:i') : null,
        'built_at' => (new DateTime('now', $tz))->format('Y-m-d H:i'),
        'logs_found' => count(tj_visit_logs()),
    ];
}

function tj_admin_visits(): void {
    tj_admin_require('stats.view');
    $cache = tj_data_dir() . '/visits-cache.json';
    $sig = implode('|', array_map(function ($f) { return basename($f) . ':' . filemtime($f) . ':' . filesize($f); }, tj_visit_logs()));
    $c = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
    if (!$c || $c['sig'] !== $sig || $c['at'] < time() - 3600 * 6 || (!empty($_GET['refresh']) && $c['at'] < time() - 600)) {
        $c = ['sig' => $sig, 'at' => time(), 'data' => tj_visit_build()];
        @file_put_contents($cache, json_encode($c), LOCK_EX);
    }
    tj_json($c['data']);
}
