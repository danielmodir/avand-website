<?php
/* Google authorization and the app's one-use login grant. The signed,
 * HttpOnly cookie stays in the browser that opened Google. The app keeps a
 * separate verifier, including when Android hands off to the system browser. */
declare(strict_types=1);

const TJ_GOOGLE_COOKIE = 'tj_google_flow';

function tj_google_enabled(): bool {
    $cfg = tj_config();
    return !empty($cfg['google_client_id']) && !empty($cfg['google_client_secret'])
        && strpos($cfg['google_redirect_uri'] ?? '', 'https://') === 0
        && function_exists('curl_init') && function_exists('openssl_verify');
}

function tj_google_cookie(string $value, int $expires): void {
    setcookie(TJ_GOOGLE_COOKIE, $value, ['expires' => $expires, 'secure' => true, 'httponly' => true,
        'samesite' => 'Lax', 'path' => parse_url(tj_config()['google_redirect_uri'], PHP_URL_PATH)]);
}

function tj_google_redirect(string $url): void {
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    header('Location: ' . $url, true, 302);
    exit;
}

function tj_google_start(): void {
    if (!tj_google_enabled()) tj_fail(503, 'google_sign_in_disabled');
    $cfg = tj_config();
    if (($_GET['next'] ?? $cfg['app_url']) !== $cfg['app_url']) tj_fail(400, 'invalid_redirect');
    $challenge = $_GET['challenge'] ?? '';
    if (!is_string($challenge) || !preg_match('/^[a-f0-9]{64}$/D', $challenge)) tj_fail(400, 'invalid_challenge');
    tj_throttle('google_start', tj_client_ip(), 60, 600);
    $state = tj_random_token();
    $verifier = tj_random_token();
    $expires = time() + 600;
    $data = implode('|', [$state, $verifier, $challenge, $expires]);
    $mac = hash_hmac('sha256', $data, base64_decode(tj_secrets()['enc_key']));
    tj_google_cookie($data . '|' . $mac, $expires);
    tj_google_redirect('https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => $cfg['google_client_id'], 'redirect_uri' => $cfg['google_redirect_uri'],
        'response_type' => 'code', 'scope' => 'openid email profile', 'prompt' => 'select_account',
        'state' => $state, 'nonce' => hash('sha256', $verifier),
        'code_challenge_method' => 'S256', 'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
    ]));
}

function tj_google_json(string $url, ?array $post = null): array {
    $curl = curl_init($url);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
    if ($post !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($post));
    $body = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    $data = is_string($body) ? json_decode($body, true) : null;
    if ($status !== 200 || !is_array($data)) throw new DomainException('google_provider_error');
    return $data;
}

function tj_google_claims(string $jwt, array $certs, string $audience, string $nonce): array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) throw new DomainException('invalid_google_code');
    $decode = function ($value) { return base64_decode(strtr($value, '-_', '+/'), true); };
    $header = json_decode((string)$decode($parts[0]), true);
    $claims = json_decode((string)$decode($parts[1]), true);
    $kid = $header['kid'] ?? null;
    $sig = $decode($parts[2]);
    if (($header['alg'] ?? '') !== 'RS256' || !is_string($kid) || !isset($certs[$kid]) || !$sig ||
        openssl_verify($parts[0] . '.' . $parts[1], $sig, $certs[$kid], OPENSSL_ALGO_SHA256) !== 1 ||
        !in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true) ||
        ($claims['aud'] ?? null) !== $audience || ($claims['azp'] ?? $audience) !== $audience ||
        ($claims['nonce'] ?? null) !== $nonce || (int)($claims['exp'] ?? 0) <= time() ||
        !is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 255)
        throw new DomainException('invalid_google_code');
    return $claims;
}

function tj_google_user(PDO $db, array $claims): int {
    $subject = tj_hash($claims['sub']);
    $q = $db->prepare('SELECT u.id, u.status FROM tj_google_accounts a JOIN tj_users u ON u.id=a.user_id WHERE a.subject_hash=?');
    $q->execute([$subject]);
    if ($u = $q->fetch()) {
        if ($u['status'] !== 'active') throw new DomainException('account_suspended');
        return (int)$u['id'];
    }
    $email = strtolower(tj_str($claims, 'email', 255));
    if (($claims['email_verified'] ?? false) !== true || !tj_valid_email($email)) throw new DomainException('google_email_unverified');
    $q = $db->prepare('SELECT id FROM tj_users WHERE email=?');
    $q->execute([$email]);
    if ($q->fetch()) throw new DomainException('google_account_exists');
    $db->prepare('INSERT INTO tj_users (email,password_hash,first_name,last_name,public_id,display_id,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
       ->execute([$email, '!', tj_str($claims, 'given_name', 60), tj_str($claims, 'family_name', 60),
                  tj_new_public_id(), tj_new_display_id($db), tj_now(), tj_now(), tj_now()]);
    $uid = (int)$db->lastInsertId();
    $db->prepare('INSERT INTO tj_google_accounts (user_id,subject_hash) VALUES (?,?)')->execute([$uid, $subject]);
    return $uid;
}

function tj_google_callback(): void {
    if (!tj_google_enabled()) tj_fail(503, 'google_sign_in_disabled');
    $cfg = tj_config();
    $parts = explode('|', $_COOKIE[TJ_GOOGLE_COOKIE] ?? '');
    if (count($parts) !== 5) tj_fail(400, 'invalid_state');
    $mac = array_pop($parts);
    [$state, $verifier, $challenge, $expires] = $parts;
    if (!hash_equals(hash_hmac('sha256', implode('|', $parts), base64_decode(tj_secrets()['enc_key'])), $mac)
        || !is_string($_GET['state'] ?? null) || !hash_equals($state, $_GET['state']) || (int)$expires <= time())
        tj_fail(400, 'invalid_state');
    tj_google_cookie('', 1);
    if (isset($_GET['error']) || !is_string($_GET['code'] ?? null)) tj_google_redirect($cfg['app_url'] . '#login_error=google_cancelled');
    try {
        $tokens = tj_google_json('https://oauth2.googleapis.com/token', ['client_id' => $cfg['google_client_id'],
            'client_secret' => $cfg['google_client_secret'], 'redirect_uri' => $cfg['google_redirect_uri'],
            'code' => $_GET['code'], 'grant_type' => 'authorization_code', 'code_verifier' => $verifier]);
        $certs = tj_google_json('https://www.googleapis.com/oauth2/v1/certs');
        $claims = tj_google_claims($tokens['id_token'] ?? '', $certs, $cfg['google_client_id'], hash('sha256', $verifier));
        $db = tj_db();
        tj_tx_begin($db);
        try {
            $uid = tj_google_user($db, $claims);
            $code = tj_random_token();
            $db->prepare('INSERT INTO tj_tokens (user_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
               ->execute([$uid, 'google_login', tj_hash($code . ':' . $challenge), tj_now(60), tj_now()]);
            tj_tx_commit($db);
        } catch (Throwable $e) {
            tj_tx_rollback($db);
            if ($e instanceof PDOException && $e->getCode() === '23000') throw new DomainException('google_retry');
            throw $e;
        }
    } catch (DomainException $e) {
        tj_google_redirect($cfg['app_url'] . '#login_error=' . rawurlencode($e->getMessage()));
    }
    tj_google_redirect($cfg['app_url'] . '#login_code=' . $code);
}

function tj_google_exchange(): void {
    $b = tj_body();
    $code = tj_str($b, 'code', 128);
    $verifier = tj_str($b, 'verifier', 128);
    if (!preg_match('/^[a-zA-Z0-9_-]{43}$/D', $code) || !preg_match('/^[a-f0-9]{64}$/D', $verifier))
        tj_fail(401, 'invalid_or_expired_code');
    $hash = tj_hash($code . ':' . tj_hash($verifier));
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $q = $db->prepare("UPDATE tj_tokens SET used_at=? WHERE purpose='google_login' AND token_hash=? AND used_at IS NULL AND expires_at>?");
        $q->execute([tj_now(), $hash, tj_now()]);
        if ($q->rowCount() !== 1) { tj_tx_rollback($db); tj_fail(401, 'invalid_or_expired_code'); }
        $q = $db->prepare('SELECT u.id,u.status FROM tj_users u JOIN tj_tokens t ON t.user_id=u.id WHERE t.token_hash=?');
        $q->execute([$hash]);
        $user = $q->fetch();
        if ($user['status'] !== 'active') { tj_tx_rollback($db); tj_fail(403, 'account_suspended'); }
        $tokens = tj_new_session((int)$user['id']);
        tj_tx_commit($db);
    } catch (Throwable $e) { tj_tx_rollback($db); throw $e; }
    tj_json($tokens);
}
