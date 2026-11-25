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

function tj_gcal_local_repeat($value, string $date): ?array {
    if (!is_array($value) || empty($value['mode'])) return null;
    $mode = $value['mode'];
    $n = $value['interval'] ?? 1;
    if (!is_int($n) || $n < 1) throw new DomainException('unsupported_recurrence');
    if ($mode === 'interval' && $n <= 30) return ['mode' => 'interval', 'interval' => $n, 'weekdays' => [], 'anchor' => null, 'cal' => null];
    if ($mode === 'weekdays' && $n === 1 && is_array($value['weekdays'] ?? null)) {
        $weekdays = array_values(array_unique($value['weekdays']));
        if (!$weekdays || count(array_filter($weekdays, function ($day) { return is_int($day) && $day >= 0 && $day <= 6; })) !== count($weekdays))
            throw new DomainException('unsupported_recurrence');
        sort($weekdays);
        return ['mode' => 'weekdays', 'interval' => 1, 'weekdays' => $weekdays, 'anchor' => null, 'cal' => null];
    }
    if (($mode === 'monthly' && $n <= 12) || ($mode === 'yearly' && $n <= 10)) {
        $anchor = $value['anchor'] ?? null;
        if (($value['cal'] ?? null) !== 'gregorian' || !is_string($anchor) || !tj_gcal_date($anchor))
            throw new DomainException('unsupported_recurrence');
        if (($mode === 'monthly' && substr($anchor, 8) !== substr($date, 8))
            || ($mode === 'yearly' && substr($anchor, 5) !== substr($date, 5)))
            throw new DomainException('unsupported_recurrence');
        return ['mode' => $mode, 'interval' => $n, 'weekdays' => [], 'anchor' => $date, 'cal' => 'gregorian'];
    }
    throw new DomainException('unsupported_recurrence');
}

function tj_gcal_rrule(?array $repeat, string $date): ?string {
    if ($repeat === null) return null;
    $n = $repeat['interval'];
    if ($repeat['mode'] === 'interval') return "RRULE:FREQ=DAILY;INTERVAL=$n";
    if ($repeat['mode'] === 'weekdays') {
        $days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        return 'RRULE:FREQ=WEEKLY;BYDAY=' . implode(',', array_map(function ($i) use ($days) { return $days[$i]; }, $repeat['weekdays']));
    }
    if ($repeat['mode'] === 'monthly') return 'RRULE:FREQ=MONTHLY;INTERVAL=' . $n . ';BYMONTHDAY=' . (int)substr($date, 8, 2);
    return 'RRULE:FREQ=YEARLY;INTERVAL=' . $n . ';BYMONTH=' . (int)substr($date, 5, 2) . ';BYMONTHDAY=' . (int)substr($date, 8, 2);
}

function tj_gcal_google_repeat($lines, string $date): ?array {
    if (!$lines) return null;
    if (!is_array($lines) || count($lines) !== 1 || !is_string($lines[0]) || strpos($lines[0], 'RRULE:') !== 0)
        throw new DomainException('unsupported_google_recurrence');
    $parts = [];
    foreach (explode(';', substr($lines[0], 6)) as $part) {
        $kv = explode('=', $part, 2);
        if (count($kv) !== 2 || isset($parts[$kv[0]])) throw new DomainException('unsupported_google_recurrence');
        $parts[$kv[0]] = $kv[1];
    }
    foreach (array_keys($parts) as $key)
        if (!in_array($key, ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTH', 'BYMONTHDAY'], true)) throw new DomainException('unsupported_google_recurrence');
    if (isset($parts['INTERVAL']) && !ctype_digit($parts['INTERVAL'])) throw new DomainException('unsupported_google_recurrence');
    if (isset($parts['BYMONTH']) && !ctype_digit($parts['BYMONTH'])) throw new DomainException('unsupported_google_recurrence');
    if (isset($parts['BYMONTHDAY']) && !ctype_digit($parts['BYMONTHDAY'])) throw new DomainException('unsupported_google_recurrence');
    $n = isset($parts['INTERVAL']) ? (int)$parts['INTERVAL'] : 1;
    $mode = ['DAILY' => 'interval', 'WEEKLY' => 'weekdays', 'MONTHLY' => 'monthly', 'YEARLY' => 'yearly'][$parts['FREQ'] ?? ''] ?? null;
    if ($mode === null || $n < 1) throw new DomainException('unsupported_google_recurrence');
    $days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    if ($mode === 'interval' && count(array_diff(array_keys($parts), ['FREQ', 'INTERVAL'])) === 0 && $n <= 30)
        return tj_gcal_local_repeat(['mode' => 'interval', 'interval' => $n], $date);
    if ($mode === 'weekdays' && $n === 1 && isset($parts['BYDAY']) && count(array_diff(array_keys($parts), ['FREQ', 'INTERVAL', 'BYDAY'])) === 0) {
        $indices = array_map(function ($day) use ($days) { return array_search($day, $days, true); }, explode(',', $parts['BYDAY']));
        if (in_array(false, $indices, true)) throw new DomainException('unsupported_google_recurrence');
        return tj_gcal_local_repeat(['mode' => 'weekdays', 'interval' => 1, 'weekdays' => $indices], $date);
    }
    if ($mode === 'monthly' && $n <= 12 && isset($parts['BYMONTHDAY']) && (int)$parts['BYMONTHDAY'] === (int)substr($date, 8, 2)
        && count(array_diff(array_keys($parts), ['FREQ', 'INTERVAL', 'BYMONTHDAY'])) === 0)
        return tj_gcal_local_repeat(['mode' => 'monthly', 'interval' => $n, 'anchor' => $date, 'cal' => 'gregorian'], $date);
    if ($mode === 'yearly' && $n <= 10 && isset($parts['BYMONTH'], $parts['BYMONTHDAY'])
        && (int)$parts['BYMONTH'] === (int)substr($date, 5, 2) && (int)$parts['BYMONTHDAY'] === (int)substr($date, 8, 2)
        && count(array_diff(array_keys($parts), ['FREQ', 'INTERVAL', 'BYMONTH', 'BYMONTHDAY'])) === 0)
        return tj_gcal_local_repeat(['mode' => 'yearly', 'interval' => $n, 'anchor' => $date, 'cal' => 'gregorian'], $date);
    throw new DomainException('unsupported_google_recurrence');
}

function tj_gcal_local_event(array $event): array {
    if (!empty($event['groupId'])) throw new DomainException('group_event');
    $repeat = $event['recurrence'] ?? null;
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
    $repeat = tj_gcal_local_repeat($repeat, $date);
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
        'recurrence' => $repeat,
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
    $resource = ['summary' => $event['title'], 'description' => $event['description'],
        'location' => $event['location'], 'start' => $start, 'end' => $end,
        'extendedProperties' => ['private' => $private]];
    $rule = tj_gcal_rrule($event['recurrence'], $startDate);
    if ($rule !== null) $resource['recurrence'] = [$rule];
    return $resource;
}

function tj_gcal_google_event(array $event, string $timeZone = 'Asia/Tehran'): array {
    if (($event['status'] ?? '') === 'cancelled') throw new DomainException('deleted_event');
    if (isset($event['recurringEventId']) || isset($event['originalStartTime']))
        throw new DomainException('unsupported_google_recurrence');
    if (($event['eventType'] ?? 'default') !== 'default')
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
    $repeat = tj_gcal_google_repeat($event['recurrence'] ?? null, $date);
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
        'recurrence' => $repeat,
    ];
}
