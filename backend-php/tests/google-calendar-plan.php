<?php
declare(strict_types=1);
require __DIR__ . '/../lib/google_calendar_plan.php';

function event(string $id, string $title): array {
    return ['id' => $id, 'title' => $title, 'date' => '2026-11-25', 'recurrence' => ['mode' => null]];
}
function remote(array $event, string $id): array {
    return ['id' => $id, 'etag' => '"etag-' . $id . '"'] + tj_gcal_google_resource(tj_gcal_local_event($event), $event['id']);
}
function actions(array $plan): array {
    $out = [];
    foreach ($plan['actions'] as $row) $out[($row['local_id'] ?? '-') . '/' . ($row['google_id'] ?? '-')] = $row['action'];
    return $out;
}
function equals($actual, $expected, string $why): void {
    if ($actual !== $expected) throw new RuntimeException($why . ': ' . var_export([$actual, $expected], true));
}

$one = event('one', 'One');
$two = event('two', 'Two');
$edited = event('two', 'Two edited');
$three = event('three', 'Three');
$four = event('four', 'Four');
$solar = event('solar', 'Solar');
$solar['recurrence'] = ['mode' => 'yearly', 'interval' => 1, 'anchor' => '2026-11-25', 'cal' => 'jalali'];
$links = [
    ['local_id' => 'one', 'google_id' => 'g-one', 'base' => tj_gcal_local_event($one)],
    ['local_id' => 'two', 'google_id' => 'g-two', 'base' => tj_gcal_local_event($two)],
];
$independent = remote($four, 'g-four');
unset($independent['extendedProperties']['private']['toojibeeId']);
$plan = tj_gcal_plan_collection([$one, $edited, $three, $solar], [remote($one, 'g-one'), remote($two, 'g-two'), $independent], $links);
equals(actions($plan), ['one/g-one' => 'none', 'two/g-two' => 'update_google', 'three/-' => 'create_google', '-/g-four' => 'create_local'], 'merge plan');
equals($plan['skipped'][0]['reason'], 'unsupported_recurrence', 'solar recurrence stays local');

$deleted = tj_gcal_plan_collection([], [remote($one, 'g-one')], [$links[0]]);
equals(actions($deleted), ['one/g-one' => 'confirm_local_delete'], 'manual deletion');
$special = remote($one, 'g-one'); $special['eventType'] = 'outOfOffice';
$unsupported = tj_gcal_plan_collection([$one], [$special], [$links[0]]);
equals(actions($unsupported), ['one/g-one' => 'unsupported_link'], 'unsupported Google event is not deletion');
$match = tj_gcal_plan_collection([$one], [remote($one, 'g-one')], []);
equals(actions($match), ['one/g-one' => 'link_equal'], 'reconnect by stable ID');
$missingLocal = tj_gcal_plan_collection([], [remote($one, 'g-one')], []);
equals(actions($missingLocal), ['one/g-one' => 'confirm_local_delete'], 'private ID with missing local event requires confirmation');
$duplicateMarker = tj_gcal_plan_collection([$one], [remote($one, 'g-old'), remote($one, 'g-restored')],
    [['local_id' => 'one', 'google_id' => 'g-old', 'base' => tj_gcal_local_event($one)]]);
equals(actions($duplicateMarker), ['one/g-old' => 'none'], 'second marker never imports duplicate');
equals($duplicateMarker['skipped'][0]['reason'], 'linked_elsewhere', 'duplicate marker surfaced');
echo "Google Calendar collection plan: PASS\n";
$series = remote($one, 'series');
$exception = ['id' => 'exception', 'status' => 'cancelled', 'recurringEventId' => 'series'];
$withException = tj_gcal_plan_collection([$one], [$series, $exception],
    [['local_id' => 'one', 'google_id' => 'series', 'base' => tj_gcal_local_event($one)]]);
equals(actions($withException), ['one/series' => 'unsupported_link'], 'series with exception is protected');
