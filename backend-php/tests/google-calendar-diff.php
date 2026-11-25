<?php
declare(strict_types=1);
require __DIR__ . '/../lib/google_calendar_diff.php';

$base = ['title' => 'Meeting', 'date' => '2026-11-25', 'location' => 'Office'];
$same = ['location' => 'Office', 'date' => '2026-11-25', 'title' => 'Meeting'];
$localEdit = array_replace($base, ['title' => 'Team meeting']);
$googleEdit = array_replace($base, ['location' => 'Online']);
$cases = [
    ['none', $base, $same, $base],
    ['update_google', $base, $localEdit, $base],
    ['update_local', $base, $base, $googleEdit],
    ['conflict_both_edited', $base, $localEdit, $googleEdit],
    ['link_equal', $base, $localEdit, $localEdit],
    ['confirm_local_delete', $base, null, $base],
    ['confirm_google_delete', $base, $base, null],
    ['confirm_local_delete', $base, null, $googleEdit],
    ['confirm_google_delete', $base, $localEdit, null],
    ['unlink', $base, null, null],
    ['create_google', null, $base, null],
    ['create_local', null, null, $base],
    ['link_equal', null, $base, $same],
    ['conflict_initial', null, $localEdit, $googleEdit],
    ['none', null, null, null],
];
foreach ($cases as [$expected, $before, $local, $google]) {
    $actual = tj_gcal_plan_pair($before, $local, $google);
    if ($actual !== $expected) throw new RuntimeException("$expected expected, got $actual");
}
if (tj_gcal_fingerprint($base) !== tj_gcal_fingerprint($same))
    throw new RuntimeException('Object key order changed the fingerprint');
if (tj_gcal_fingerprint(['days' => [1, 2]]) === tj_gcal_fingerprint(['days' => [2, 1]]))
    throw new RuntimeException('List order was lost');
echo "Google Calendar three-way diff: PASS\n";
