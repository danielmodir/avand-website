<?php
/* Google API transport and complete, read-only primary-calendar snapshot.
 * Writes require a separate conflict-resolution and etag-checked path. */
declare(strict_types=1);

function tj_gcal_http(string $url, ?string $accessToken = null, ?array $form = null): array {
    $curl = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($accessToken !== null) $headers[] = 'Authorization: Bearer ' . $accessToken;
    if ($form !== null) $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_HTTPHEADER => $headers]);
    if ($form !== null) curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($form)]);
    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    $data = is_string($body) ? json_decode($body, true) : null;
    return ['status' => $status, 'data' => is_array($data) ? $data : []];
}

function tj_gcal_access_token(int $userId): string {
    $q = tj_db()->prepare('SELECT refresh_token_enc FROM tj_google_calendar_grants WHERE user_id=?');
    $q->execute([$userId]);
    $row = $q->fetch();
    if (!$row) tj_fail(409, 'google_calendar_not_connected');
    $refresh = tj_decrypt($row['refresh_token_enc']);
    if ($refresh === null) tj_fail(500, 'calendar_grant_unreadable');
    $cfg = tj_config();
    $result = tj_gcal_http('https://oauth2.googleapis.com/token', null, [
        'client_id' => $cfg['google_client_id'], 'client_secret' => $cfg['google_client_secret'],
        'refresh_token' => $refresh, 'grant_type' => 'refresh_token']);
    $token = $result['data']['access_token'] ?? null;
    if ($result['status'] !== 200 || !is_string($token) || $token === '')
        tj_fail(502, 'google_calendar_reconnect_required');
    return $token;
}

/* $fetch receives the opaque page token and returns one decoded Google
 * events.list response. No partial result is returned after an error. */
function tj_gcal_read_pages(callable $fetch): array {
    $events = []; $next = null; $seen = [];
    for ($page = 0; $page < 20; $page++) {
        $result = $fetch($next);
        if (!is_array($result) || !is_array($result['items'] ?? [])) throw new DomainException('google_calendar_bad_response');
        foreach ($result['items'] ?? [] as $item) {
            if (!is_array($item)) throw new DomainException('google_calendar_bad_response');
            $events[] = $item;
            if (count($events) > 10000) throw new DomainException('google_calendar_too_many_events');
        }
        $next = $result['nextPageToken'] ?? null;
        if ($next === null) return $events;
        if (!is_string($next) || $next === '' || isset($seen[$next])) throw new DomainException('google_calendar_bad_response');
        $seen[$next] = true;
    }
    throw new DomainException('google_calendar_too_many_events');
}

function tj_gcal_remote_events(string $accessToken): array {
    return tj_gcal_read_pages(function ($pageToken) use ($accessToken) {
        $params = ['maxResults' => 2500, 'singleEvents' => 'false', 'showDeleted' => 'true'];
        if ($pageToken !== null) $params['pageToken'] = $pageToken;
        $url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?' . http_build_query($params);
        $result = tj_gcal_http($url, $accessToken);
        if ($result['status'] !== 200) throw new DomainException('google_calendar_provider_error');
        return $result['data'];
    });
}
