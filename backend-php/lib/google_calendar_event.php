<?php
/* Lossless subset of the app's event model for Google Calendar. Unsupported
 * recurrence and special Google event types are reported, never flattened
 * into misleading one-off events. */
declare(strict_types=1);

function tj_gcal_date(string $date): bool {
    return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $m)
        && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

function tj_gcal_time(string $time): bool {
    return (bool)preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $time);
}

function tj_gcal_web_url($value): string {
    if (!is_string($value) || $value === '' || strlen($value) > 2048) return '';
    $url = filter_var($value, FILTER_VALIDATE_URL);
    $scheme = strtolower((string)parse_url($value, PHP_URL_SCHEME));
    return $url && in_array($scheme, ['http', 'https'], true) ? $value : '';
}

function tj_gcal_local_event(array $event): array {
    if (!empty($event['groupId'])) throw new DomainException('group_event');
    $repeat = $event['recurrence'] ?? null;
    if (is_array($repeat) && !empty($repeat['mode'])) throw new DomainException('unsupported_recurrence');
    $date = $event['date'] ?? '';
    $endDate = $event['endDate'] ?? null;
    $startTime = $event['startTime'] ?? null;
    $endTime = $event['endTime'] ?? null;
    if (!is_string($date) || !tj_gcal_date($date) || ($endDate !== null && (!is_string($endDate) || !tj_gcal_date($endDate) || $endDate < $date))
        || ($startTime !== null && (!is_string($startTime) || !tj_gcal_time($startTime)))
        || ($endTime !== null && (!is_string($endTime) || !tj_gcal_time($endTime)))
        || ($endTime !== null && $startTime === null)) throw new DomainException('invalid_event_time');
    if ($startTime !== null && $endTime !== null && ($endDate ?? $date) === $date && $endTime <= $startTime)
        throw new DomainException('invalid_event_time');
    if ($startTime !== null && $endDate !== null && $endTime === null) throw new DomainException('invalid_event_time');
    $title = trim((string)($event['title'] ?? ''));
    if ($title === '') throw new DomainException('invalid_event_title');
    return [
        'title' => $title,
        'kind' => in_array($event['kind'] ?? '', ['', 'birthday', 'countdown'], true) ? ($event['kind'] ?? '') : '',
        'description' => (string)($event['description'] ?? ''),
        'location' => (string)($event['location'] ?? ''),
        'meetingUrl' => tj_gcal_web_url($event['meetingUrl'] ?? ''),
        'date' => $date,
        'endDate' => $endDate,
        'startTime' => $startTime,
        'endTime' => $endTime,
    ];
}

function tj_gcal_google_resource(array $event, string $localId, string $timeZone = 'Asia/Tehran'): array {
    $startDate = $event['date'];
    $lastDate = $event['endDate'] ?? $startDate;
    $private = ['toojibeeId' => $localId];
    if ($event['kind'] !== '') $private['toojibeeKind'] = $event['kind'];
    if ($event['meetingUrl'] !== '') $private['toojibeeMeetingUrl'] = $event['meetingUrl'];
    if ($event['startTime'] === null) {
        $start = ['date' => $startDate];
        $end = ['date' => (new DateTimeImmutable($lastDate))->modify('+1 day')->format('Y-m-d')];
    } else {
        $zone = new DateTimeZone($timeZone);
        $startAt = new DateTimeImmutable($startDate . ' ' . $event['startTime'], $zone);
        if ($event['endTime'] !== null) $endAt = new DateTimeImmutable($lastDate . ' ' . $event['endTime'], $zone);
        else {
            $endAt = $startAt->modify('+1 hour');
            $private['toojibeeNoEnd'] = '1';
        }
        $start = ['dateTime' => $startAt->format(DATE_RFC3339), 'timeZone' => $timeZone];
        $end = ['dateTime' => $endAt->format(DATE_RFC3339), 'timeZone' => $timeZone];
    }
    return ['summary' => $event['title'], 'description' => $event['description'],
        'location' => $event['location'], 'start' => $start, 'end' => $end,
        'extendedProperties' => ['private' => $private]];
}

function tj_gcal_google_event(array $event, string $timeZone = 'Asia/Tehran'): array {
    if (($event['status'] ?? '') === 'cancelled') throw new DomainException('deleted_event');
    if (($event['eventType'] ?? 'default') !== 'default' || !empty($event['recurrence']))
        throw new DomainException('unsupported_google_event');
    $start = $event['start'] ?? [];
    $end = $event['end'] ?? [];
    $private = $event['extendedProperties']['private'] ?? [];
    if (isset($start['date'], $end['date']) && tj_gcal_date($start['date']) && tj_gcal_date($end['date'])) {
        $date = $start['date'];
        $last = (new DateTimeImmutable($end['date']))->modify('-1 day')->format('Y-m-d');
        if ($last < $date) throw new DomainException('invalid_google_time');
        $startTime = $endTime = null;
    } elseif (isset($start['dateTime'], $end['dateTime'])) {
        try {
            $zone = new DateTimeZone($timeZone);
            $startAt = (new DateTimeImmutable($start['dateTime'], new DateTimeZone($start['timeZone'] ?? $timeZone)))->setTimezone($zone);
            $endAt = (new DateTimeImmutable($end['dateTime'], new DateTimeZone($end['timeZone'] ?? $timeZone)))->setTimezone($zone);
        } catch (Exception $e) { throw new DomainException('invalid_google_time', 0, $e); }
        if ($endAt <= $startAt) throw new DomainException('invalid_google_time');
        $date = $startAt->format('Y-m-d');
        $last = $endAt->format('Y-m-d');
        $startTime = $startAt->format('H:i');
        $syntheticEnd = ($private['toojibeeNoEnd'] ?? '') === '1' && $endAt == $startAt->modify('+1 hour');
        $endTime = $syntheticEnd ? null : $endAt->format('H:i');
        if ($endTime === null) $last = $date;
    } else throw new DomainException('invalid_google_time');
    $title = trim((string)($event['summary'] ?? ''));
    if ($title === '') throw new DomainException('unsupported_google_event');
    return [
        'title' => $title,
        'kind' => in_array($private['toojibeeKind'] ?? '', ['', 'birthday', 'countdown'], true) ? ($private['toojibeeKind'] ?? '') : '',
        'description' => (string)($event['description'] ?? ''),
        'location' => (string)($event['location'] ?? ''),
        'meetingUrl' => tj_gcal_web_url($private['toojibeeMeetingUrl'] ?? ($event['hangoutLink'] ?? '')),
        'date' => $date,
        'endDate' => $last === $date ? null : $last,
        'startTime' => $startTime,
        'endTime' => $endTime,
    ];
}
