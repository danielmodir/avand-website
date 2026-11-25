<?php
/* A separate, owner-bound Google Calendar grant. No Google script or token
 * enters the web app; the eventual event sync runs on this API. */
declare(strict_types=1);

const TJ_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

function tj_google_calendar_enabled(): bool {
    $cfg = tj_config();
    return !empty($cfg['google_client_id']) && !empty($cfg['google_client_secret'])
        && strpos($cfg['google_calendar_redirect_uri'] ?? '', 'https://') === 0
        && function_exists('curl_init') && function_exists('openssl_encrypt');
}

function tj_google_calendar_authorize_url(string $state, string $verifier, array $cfg): string {
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => $cfg['google_client_id'],
        'redirect_uri' => $cfg['google_calendar_redirect_uri'],
        'response_type' => 'code',
        'scope' => TJ_CALENDAR_SCOPE,
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => $state,
        'code_challenge_method' => 'S256',
        'code_challenge' => $challenge,
    ]);
}

function tj_google_calendar_status(): void {
    $user = tj_require_user();
    $enabled = tj_google_calendar_enabled();
    $q = tj_db()->prepare('SELECT connected_at FROM tj_google_calendar_grants WHERE user_id = ?');
    $q->execute([(int)$user['id']]);
    $row = $q->fetch();
    tj_json(['available' => $enabled, 'connected' => (bool)$row,
        'calendar' => $row ? 'primary' : null, 'connected_at' => $row['connected_at'] ?? null]);
}

function tj_google_calendar_connect(): void {
    $user = tj_require_user();
    if (!tj_google_calendar_enabled()) tj_fail(503, 'google_calendar_disabled');
    tj_throttle('gcal_connect', (string)$user['id'], 10, 3600);
    $state = tj_random_token();
    $verifier = tj_random_token();
    $db = tj_db();
    $db->prepare('DELETE FROM tj_google_calendar_flows WHERE expires_at < ?')->execute([tj_now()]);
    $db->prepare('INSERT INTO tj_google_calendar_flows (state_hash,user_id,verifier_enc,expires_at) VALUES (?,?,?,?)')
       ->execute([tj_hash($state), (int)$user['id'], tj_encrypt($verifier), tj_now(600)]);
    tj_json(['auth_url' => tj_google_calendar_authorize_url($state, $verifier, tj_config())]);
}

function tj_google_calendar_take_flow(string $state): ?array {
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/D', $state)) return null;
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $q = $db->prepare('SELECT user_id,verifier_enc FROM tj_google_calendar_flows WHERE state_hash=? AND expires_at>?' . (tj_driver() === 'mysql' ? ' FOR UPDATE' : ''));
        $q->execute([tj_hash($state), tj_now()]);
        $flow = $q->fetch();
        if ($flow) $db->prepare('DELETE FROM tj_google_calendar_flows WHERE state_hash=?')->execute([tj_hash($state)]);
        tj_tx_commit($db);
    } catch (Throwable $e) { tj_tx_rollback($db); throw $e; }
    return $flow ?: null;
}

function tj_google_calendar_callback(): void {
    if (!tj_google_calendar_enabled()) tj_fail(503, 'google_calendar_disabled');
    $state = $_GET['state'] ?? null;
    $flow = is_string($state) ? tj_google_calendar_take_flow($state) : null;
    if (!$flow) tj_fail(400, 'invalid_state');
    $cfg = tj_config();
    if (isset($_GET['error']) || !is_string($_GET['code'] ?? null))
        tj_google_redirect($cfg['app_url'] . '#calendar_google=cancelled');
    $verifier = tj_decrypt($flow['verifier_enc']);
    if ($verifier === null) tj_fail(500, 'calendar_grant_unreadable');
    try {
        $tokens = tj_google_json('https://oauth2.googleapis.com/token', [
            'client_id' => $cfg['google_client_id'],
            'client_secret' => $cfg['google_client_secret'],
            'redirect_uri' => $cfg['google_calendar_redirect_uri'],
            'code' => $_GET['code'],
            'grant_type' => 'authorization_code',
            'code_verifier' => $verifier,
        ]);
    } catch (DomainException $e) {
        tj_google_redirect($cfg['app_url'] . '#calendar_google=provider_error');
    }
    $refresh = $tokens['refresh_token'] ?? null;
    $scopes = explode(' ', (string)($tokens['scope'] ?? ''));
    if (!is_string($refresh) || $refresh === '' || strlen($refresh) > 4096 || !in_array(TJ_CALENDAR_SCOPE, $scopes, true))
        tj_google_redirect($cfg['app_url'] . '#calendar_google=permission_missing');
    $token = tj_encrypt($refresh);
    $uid = (int)$flow['user_id'];
    tj_tx_begin($db);
    try {
        $q = $db->prepare('SELECT user_id FROM tj_google_calendar_grants WHERE user_id=?');
        $q->execute([$uid]);
        if ($q->fetch())
            $db->prepare('UPDATE tj_google_calendar_grants SET refresh_token_enc=?,updated_at=? WHERE user_id=?')
               ->execute([$token, tj_now(), $uid]);
        else
            $db->prepare('INSERT INTO tj_google_calendar_grants (user_id,refresh_token_enc,connected_at,updated_at) VALUES (?,?,?,?)')
               ->execute([$uid, $token, tj_now(), tj_now()]);
        tj_tx_commit($db);
    } catch (Throwable $e) { tj_tx_rollback($db); throw $e; }
    tj_google_redirect($cfg['app_url'] . '#calendar_google=connected');
}

function tj_google_calendar_disconnect(): void {
    $user = tj_require_user();
    $db = tj_db();
    $q = $db->prepare('SELECT refresh_token_enc FROM tj_google_calendar_grants WHERE user_id=?');
    $q->execute([(int)$user['id']]);
    $row = $q->fetch();
    if ($row) {
        $token = tj_decrypt($row['refresh_token_enc']);
        if ($token !== null && function_exists('curl_init')) {
            $curl = curl_init('https://oauth2.googleapis.com/revoke');
            curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['token' => $token]),
                CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
            curl_exec($curl);
            curl_close($curl);
        }
        $db->prepare('DELETE FROM tj_google_calendar_grants WHERE user_id=?')->execute([(int)$user['id']]);
    }
    tj_json(['connected' => false]);
}
