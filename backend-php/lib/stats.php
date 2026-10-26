<?php
/* Anonymous, opt-in product counts (Settings → "Help improve Toojibee").
 *
 * The app sends an event name only when the person switched this on. What's
 * kept is how many times each event happened on each day, in one small JSON
 * file in the data folder: no account, no IP, no device id, no time of day,
 * nothing about anyone's tasks or period. A throttle per IP (not stored with
 * the counts) keeps it from being flooded.
 *
 *   POST /stats {event}                one of TJ_STAT_EVENTS
 *   GET  /admin/stats  (stats.view)    the last 30 days' counts
 */
declare(strict_types=1);

const TJ_STAT_EVENTS = [
    'onboarding_done',  // the first tutorial was finished or skipped
    'first_task',       // the first task on this device
    'first_habit',      // the first habit on this device
    'return_d1', 'return_d7', 'return_d30', // opened again 1, 7, 30 days after first use
    'share',            // something was shared (a day, an invite, a group)
    'invite_accepted',  // a friend's invite link was used
];
const TJ_STAT_DAYS = 30;

function tj_stats_file(): string { return tj_data_dir() . '/stats-counts.json'; }

function tj_stats_post(): void {
    tj_throttle('stats', tj_client_ip(), 60, 3600);
    $event = (string)(tj_body()['event'] ?? '');
    if (!in_array($event, TJ_STAT_EVENTS, true)) tj_fail(400, 'unknown_event');
    $day = gmdate('Y-m-d');
    $f = fopen(tj_stats_file(), 'c+');
    if ($f && flock($f, LOCK_EX)) {
        $data = json_decode((string)stream_get_contents($f), true) ?: [];
        $data[$day][$event] = ($data[$day][$event] ?? 0) + 1;
        // Only the last TJ_STAT_DAYS days are kept.
        $since = gmdate('Y-m-d', time() - TJ_STAT_DAYS * 86400);
        foreach (array_keys($data) as $d) if ($d < $since) unset($data[$d]);
        ftruncate($f, 0); rewind($f);
        fwrite($f, json_encode($data));
        flock($f, LOCK_UN);
    }
    if ($f) fclose($f);
    tj_json(['ok' => true]);
}

function tj_admin_stats(): void {
    tj_admin_require('stats.view');
    $data = is_file(tj_stats_file()) ? (json_decode((string)file_get_contents(tj_stats_file()), true) ?: []) : [];
    $totals = [];
    foreach ($data as $day => $events) foreach ($events as $e => $n) $totals[$e] = ($totals[$e] ?? 0) + $n;
    ksort($data);
    tj_json(['days' => $data, 'totals' => $totals, 'events' => TJ_STAT_EVENTS]);
}
