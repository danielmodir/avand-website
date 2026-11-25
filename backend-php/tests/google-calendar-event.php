<?php
declare(strict_types=1);
require __DIR__ . '/../lib/google_calendar_event.php';

function same($a, $b, string $why): void {
    if ($a !== $b) throw new RuntimeException($why . ': ' . var_export([$a, $b], true));
}
function rejects(callable $fn, string $reason): void {
    try { $fn(); } catch (DomainException $e) {
        if ($e->getMessage() === $reason) return;
        throw $e;
    }
    throw new RuntimeException('Expected ' . $reason);
}

$base = ['id' => 'event-1', 'title' => 'Visit', 'date' => '2026-11-25',
    'description' => 'Details', 'location' => 'Office', 'meetingUrl' => 'https://meet.example.test/one',
    'recurrence' => ['mode' => null]];
$allDay = tj_gcal_local_event($base + ['endDate' => '2026-11-27']);
$resource = tj_gcal_google_resource($allDay, 'event-1');
same($resource['start']['date'], '2026-11-25', 'all-day start');
same($resource['end']['date'], '2026-11-28', 'exclusive Google end');
same($resource['extendedProperties']['private']['toojibeeId'], 'event-1', 'stable identity');
same(tj_gcal_google_event($resource), $allDay, 'all-day round trip');

$timed = tj_gcal_local_event($base + ['startTime' => '09:30']);
$resource = tj_gcal_google_resource($timed, 'event-1');
same($resource['start']['timeZone'], 'Asia/Tehran', 'timezone');
same($resource['extendedProperties']['private']['toojibeeNoEnd'], '1', 'no end marker');
same(tj_gcal_google_event($resource), $timed, 'timed no-end round trip');
$resource['end']['dateTime'] = '2026-11-25T13:00:00+03:30';
same(tj_gcal_google_event($resource)['endTime'], '13:00', 'Google end edit wins over synthetic marker');

$incoming = ['summary' => 'Call', 'start' => ['dateTime' => '2026-11-25T07:00:00Z'],
    'end' => ['dateTime' => '2026-11-25T08:00:00Z']];
$projected = tj_gcal_google_event($incoming);
same([$projected['date'], $projected['startTime'], $projected['endTime']], ['2026-11-25', '10:30', '11:30'], 'UTC to Iran');
rejects(fn() => tj_gcal_local_event(array_replace($base, ['recurrence' => ['mode' => 'yearly', 'cal' => 'jalali']])), 'unsupported_recurrence');
rejects(fn() => tj_gcal_local_event($base + ['groupId' => 'group-1']), 'group_event');
rejects(fn() => tj_gcal_google_event($incoming + ['eventType' => 'outOfOffice']), 'unsupported_google_event');
rejects(fn() => tj_gcal_google_event($incoming + ['recurrence' => ['RRULE:FREQ=MONTHLY']]), 'unsupported_google_event');
echo "Google Calendar event projection: PASS\n";
