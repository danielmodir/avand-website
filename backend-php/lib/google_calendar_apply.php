<?php
/* Apply one freshly planned event action. Local version and Google etags
 * are checked again; deletion and competing edits require an explicit choice. */
declare(strict_types=1);

require_once __DIR__ . '/google_calendar_plan.php';
require_once __DIR__ . '/google_calendar_remote.php';

function tj_gcal_local_record(array $projection, string $id, ?array $existing = null): array {
    $record = $existing ?? ['id' => $id, 'color' => '', 'showInPlanning' => true,
        'showInOccasions' => true, 'notification' => ['type' => null]];
    foreach (['title', 'kind', 'description', 'location', 'meetingUrl', 'date',
        'endDate', 'startTime', 'endTime', 'recurrence'] as $key) $record[$key] = $projection[$key];
    $record['timeMode'] = $projection['endDate'] === null ? 'single' : 'range';
    return $record;
}

function tj_gcal_save_link(PDO $db, int $userId, string $localId, string $googleId,
    array $projection, string $etag): void {
    $base = json_encode($projection, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $hash = hash('sha256', $googleId);
    $q = $db->prepare('SELECT local_id FROM tj_google_calendar_links WHERE user_id=? AND local_id=?');
    $q->execute([$userId, $localId]);
    if ($q->fetch()) $db->prepare('UPDATE tj_google_calendar_links SET google_id=?,google_id_hash=?,base_json=?,google_etag=?,updated_at=? WHERE user_id=? AND local_id=?')
        ->execute([$googleId, $hash, $base, $etag, tj_now(), $userId, $localId]);
    else $db->prepare('INSERT INTO tj_google_calendar_links (user_id,local_id,google_id,google_id_hash,base_json,google_etag,updated_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$userId, $localId, $googleId, $hash, $base, $etag, tj_now()]);
}

function tj_gcal_remote_checked(string $token, string $id, ?string $etag): array {
    $response = tj_gcal_event_request('GET', $token, $id);
    if ($response['status'] !== 200 || !is_string($response['data']['etag'] ?? null)
        || $response['data']['etag'] !== $etag) throw new DomainException('google_calendar_stale');
    return $response['data'];
}

function tj_gcal_write_checked(string $method, string $token, ?string $id,
    ?array $resource, ?string $etag): array {
    $response = tj_gcal_event_request($method, $token, $id, $resource, $etag);
    if (in_array($response['status'], [404, 409, 410, 412], true))
        throw new DomainException('google_calendar_stale');
    if (!in_array($response['status'], [200, 201, 204], true))
        throw new DomainException('google_calendar_provider_error');
    if ($method !== 'DELETE' && (!is_string($response['data']['id'] ?? null)
        || !is_string($response['data']['etag'] ?? null)))
        throw new DomainException('google_calendar_bad_response');
    return $response['data'];
}

function tj_gcal_matching_action(array $plan, ?string $localId, ?string $googleId): ?array {
    foreach ($plan['actions'] as $row)
        if ($row['local_id'] === $localId && $row['google_id'] === $googleId) return $row;
    return null;
}

function tj_gcal_action_allowed(string $action, ?string $choice): bool {
    $choices = [
        'confirm_local_delete' => ['keep_google', 'delete_google'],
        'confirm_google_delete' => ['keep_local', 'delete_local'],
        'conflict_both_edited' => ['local', 'google'],
        'conflict_initial' => ['local', 'google'],
    ];
    if (isset($choices[$action])) return in_array($choice, $choices[$action], true);
    return $choice === null && in_array($action,
        ['create_google', 'create_local', 'link_equal', 'update_google', 'update_local', 'none', 'unlink'], true);
}

function tj_google_calendar_apply(): void {
    $user = tj_require_user();
    if (!tj_google_calendar_enabled()) tj_fail(503, 'google_calendar_disabled');
    $userId = (int)$user['id'];
    $body = tj_body();
    $version = $body['version'] ?? null;
    $localId = $body['local_id'] ?? null; $googleId = $body['google_id'] ?? null;
    $choice = $body['choice'] ?? null;
    if (!is_int($version) || $version < 0 || ($localId !== null && (!is_string($localId) || $localId === ''))
        || ($googleId !== null && (!is_string($googleId) || $googleId === ''))
        || ($choice !== null && !is_string($choice))) tj_fail(400, 'validation_error');
    $token = tj_gcal_access_token($userId);
    try { $remote = tj_gcal_remote_events($token); }
    catch (DomainException $e) { tj_fail(502, $e->getMessage()); }
    $db = tj_db();
    $q = $db->prepare('SELECT data,version FROM tj_user_data WHERE user_id=?');
    $q->execute([$userId]); $before = $q->fetch();
    if (($before ? (int)$before['version'] : 0) !== $version) tj_fail(409, 'version_conflict');
    $decoded = $before ? json_decode($before['data'], true) : [];
    $local = is_array($decoded['events'] ?? null) ? $decoded['events'] : [];
    $q = $db->prepare('SELECT local_id,google_id,base_json FROM tj_google_calendar_links WHERE user_id=?');
    $q->execute([$userId]);
    $links = [];
    foreach ($q->fetchAll() as $row) $links[] = ['local_id' => $row['local_id'], 'google_id' => $row['google_id'],
        'base' => json_decode($row['base_json'], true)];
    $plan = tj_gcal_plan_collection($local, $remote, $links);
    $action = tj_gcal_matching_action($plan, $localId, $googleId);
    if ($action === null || !tj_gcal_action_allowed($action['action'], $choice)) tj_fail(409, 'google_calendar_plan_changed');
    $kind = $action['action'];
    $localRow = null; $remoteRow = null;
    foreach ($local as $row) if (($row['id'] ?? null) === $localId) { $localRow = $row; break; }
    foreach ($remote as $row) if (($row['id'] ?? null) === $googleId) { $remoteRow = $row; break; }
    $document = $before ? json_decode($before['data']) : new stdClass();
    if (!($document instanceof stdClass)) tj_fail(500, 'sync_document_invalid');
    if (!isset($document->events) || !is_array($document->events)) $document->events = [];
    $newVersion = $version;
    try {
        tj_tx_begin($db);
        $q = $db->prepare('SELECT version FROM tj_user_data WHERE user_id=?' . (tj_driver() === 'mysql' ? ' FOR UPDATE' : ''));
        $q->execute([$userId]); $locked = $q->fetch();
        if (($locked ? (int)$locked['version'] : 0) !== $version) throw new DomainException('version_conflict');
        if ($kind === 'create_google' || $kind === 'update_google'
            || ($kind === 'confirm_google_delete' && $choice === 'keep_local')
            || (in_array($kind, ['conflict_both_edited', 'conflict_initial'], true) && $choice === 'local')) {
            $projection = tj_gcal_local_event($localRow);
            $resource = tj_gcal_google_resource($projection, $localId);
            if ($kind === 'create_google' || $kind === 'confirm_google_delete') {
                $resource['id'] = tj_gcal_stable_id($userId, $localId . ($kind === 'confirm_google_delete' ? ':restore:' . $googleId : ''));
                $saved = tj_gcal_write_checked('POST', $token, null, $resource, null);
            } else {
                $current = tj_gcal_remote_checked($token, $googleId, $action['etag']);
                $private = $current['extendedProperties']['private'] ?? [];
                foreach (['toojibeeId', 'toojibeeKind', 'toojibeeMeetingUrl', 'toojibeeNoEnd'] as $key) unset($private[$key]);
                $resource['extendedProperties']['private'] = array_merge($private, $resource['extendedProperties']['private']);
                $saved = tj_gcal_write_checked('PATCH', $token, $googleId, $resource, $action['etag']);
            }
            tj_gcal_save_link($db, $userId, $localId, $saved['id'], $projection, $saved['etag']);
        } elseif ($kind === 'create_local' || $kind === 'update_local'
            || ($kind === 'confirm_local_delete' && $choice === 'keep_google')
            || (in_array($kind, ['conflict_both_edited', 'conflict_initial'], true) && $choice === 'google')) {
            $current = tj_gcal_remote_checked($token, $googleId, $action['etag']);
            $projection = tj_gcal_google_event($current);
            $localId = $localId ?? bin2hex(random_bytes(16));
            $record = tj_gcal_local_record($projection, $localId, $localRow);
            $replaced = false;
            foreach ($document->events as $index => $row) if (($row->id ?? null) === $localId) {
                $document->events[$index] = json_decode(json_encode($record, JSON_THROW_ON_ERROR));
                $replaced = true; break;
            }
            if (!$replaced) $document->events[] = json_decode(json_encode($record, JSON_THROW_ON_ERROR));
            $newVersion++;
            tj_gcal_save_link($db, $userId, $localId, $googleId, $projection, $current['etag']);
        } elseif ($kind === 'confirm_local_delete' && $choice === 'delete_google') {
            tj_gcal_write_checked('DELETE', $token, $googleId, null, $action['etag']);
            $db->prepare('DELETE FROM tj_google_calendar_links WHERE user_id=? AND local_id=?')->execute([$userId, $localId]);
        } elseif ($kind === 'confirm_google_delete' && $choice === 'delete_local') {
            $document->events = array_values(array_filter($document->events,
                fn($row) => ($row->id ?? null) !== $localId));
            $newVersion++;
            $db->prepare('DELETE FROM tj_google_calendar_links WHERE user_id=? AND local_id=?')->execute([$userId, $localId]);
        } elseif ($kind === 'link_equal') {
            $current = tj_gcal_remote_checked($token, $googleId, $action['etag']);
            tj_gcal_save_link($db, $userId, $localId, $googleId, tj_gcal_local_event($localRow), $current['etag']);
        } elseif ($kind === 'unlink') {
            $db->prepare('DELETE FROM tj_google_calendar_links WHERE user_id=? AND local_id=?')->execute([$userId, $localId]);
        }
        if ($newVersion !== $version) {
            $json = json_encode($document, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (strlen($json) > TJ_MAX_SYNC_BYTES) throw new DomainException('sync_document_too_large');
            if ($locked) $db->prepare('UPDATE tj_user_data SET data=?,version=?,updated_at=? WHERE user_id=?')
                ->execute([$json, $newVersion, tj_now(), $userId]);
            else $db->prepare('INSERT INTO tj_user_data (user_id,data,version,updated_at) VALUES (?,?,?,?)')
                ->execute([$userId, $json, $newVersion, tj_now()]);
        }
        tj_tx_commit($db);
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        if ($e instanceof DomainException) tj_fail(in_array($e->getMessage(), ['version_conflict', 'google_calendar_stale'], true) ? 409 : 502, $e->getMessage());
        throw $e;
    }
    tj_json(['action' => $kind, 'version' => $newVersion, 'local_id' => $localId]);
}
