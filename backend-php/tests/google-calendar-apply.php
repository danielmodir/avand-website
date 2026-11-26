<?php
declare(strict_types=1);
require __DIR__ . '/../lib/google_calendar_apply.php';

function assert_apply(bool $ok, string $why): void { if (!$ok) throw new RuntimeException($why); }

$event = ['title' => 'Meeting', 'kind' => '', 'description' => '', 'location' => '',
    'meetingUrl' => '', 'date' => '2026-11-26', 'endDate' => null,
    'startTime' => '10:00', 'endTime' => '11:00', 'recurrence' => null];
$record = tj_gcal_local_record($event, 'local-1');
assert_apply($record['id'] === 'local-1' && $record['timeMode'] === 'single'
    && $record['notification']['type'] === null, 'new local event');
$original = $record + ['custom' => 'keep'];
$edited = $event; $edited['title'] = 'Updated'; $edited['endDate'] = '2026-11-27';
$record = tj_gcal_local_record($edited, 'local-1', $original);
assert_apply($record['title'] === 'Updated' && $record['timeMode'] === 'range'
    && $record['custom'] === 'keep', 'preserve local-only fields');
assert_apply(tj_gcal_stable_id(7, 'local-1') === tj_gcal_stable_id(7, 'local-1'), 'stable Google ID');
assert_apply(tj_gcal_stable_id(7, 'local-1') !== tj_gcal_stable_id(8, 'local-1'), 'owner-separated ID');
assert_apply(tj_gcal_action_allowed('create_google', null), 'automatic create');
assert_apply(!tj_gcal_action_allowed('confirm_local_delete', null), 'manual deletion');
assert_apply(tj_gcal_action_allowed('confirm_local_delete', 'keep_google'), 'explicit restoration');
assert_apply(!tj_gcal_action_allowed('conflict_both_edited', null), 'manual conflict');
assert_apply(!tj_gcal_action_allowed('unsupported_link', null), 'unsupported protected');
echo "Google Calendar apply rules: PASS\n";
