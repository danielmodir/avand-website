<?php
/* Accounts and sessions.
 *
 * Passwords: password_hash() (bcrypt), never stored or logged in clear.
 * Tokens: random 256-bit strings; only their SHA-256 is stored, so a
 * leaked database can't be used to sign in. Access tokens live 1 hour,
 * refresh tokens 60 days and rotate on every use. Email links (verify,
 * reset) are single-use and expire.
 */
declare(strict_types=1);

function tj_valid_email(string $email): bool {
    return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/* 8+ characters with at least one letter and at least one digit or
 * symbol — same rule as the app's form and the Django API. */
function tj_password_problems(string $password): array {
    $reasons = [];
    $len = function_exists('mb_strlen') ? mb_strlen($password, 'UTF-8') : strlen($password);
    if ($len < TJ_MIN_PASSWORD) $reasons[] = 'Password must be at least ' . TJ_MIN_PASSWORD . ' characters.';
    if (strlen($password) > 200) $reasons[] = 'Password is too long.';
    if (strpos($password, "\0") !== false) $reasons[] = 'Password contains an invalid character.'; // bcrypt can't hash it
    if (!preg_match('/\p{L}/u', $password) || !preg_match('/[^\p{L}]/u', $password)) $reasons[] = 'Password must contain a letter and a number or symbol.';
    return $reasons;
}

const TJ_MIN_AGE = 9;

/* Latin letters, digits, _ and . only (no spaces, emoji or other
 * scripts), 3-30 long; stored lowercase. Same as the Django model. */
function tj_valid_username(string $u): bool {
    return (bool)preg_match('/^[a-z0-9_.]{3,30}$/', $u);
}

function tj_valid_birth_date(string $d): bool {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return false;
    $latest = gmdate('Y-m-d', strtotime('-' . TJ_MIN_AGE . ' years'));
    return $d <= $latest && (int)$m[1] >= (int)gmdate('Y') - 120;
}

function tj_new_session(int $userId): array {
    $access = tj_random_token();
    $refresh = tj_random_token();
    $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    $db = tj_db();
    $db->prepare('INSERT INTO tj_sessions (user_id, access_hash, refresh_hash, access_expires, refresh_expires, user_agent, created_at, last_used_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$userId, tj_hash($access), tj_hash($refresh), tj_now(TJ_ACCESS_TTL), tj_now(TJ_REFRESH_TTL), $ua, tj_now(), tj_now()]);
    // The random public id, never the internal sequential one.
    $q = $db->prepare('SELECT public_id FROM tj_users WHERE id = ?');
    $q->execute([$userId]);
    return ['access_token' => $access, 'refresh_token' => $refresh, 'user_id' => (string)$q->fetch()['public_id'], 'expires_in' => TJ_ACCESS_TTL];
}

/* The signed-in user for this request, or a 401. */
function tj_require_user(): array {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(\S+)$/', $h, $m)) tj_fail(401, 'not_authenticated');
    $q = tj_db()->prepare('SELECT s.id AS session_id, u.* FROM tj_sessions s JOIN tj_users u ON u.id = s.user_id
                           WHERE s.access_hash = ? AND s.revoked_at IS NULL AND s.access_expires > ?');
    $q->execute([tj_hash($m[1]), tj_now()]);
    $row = $q->fetch();
    if (!$row) tj_fail(401, 'not_authenticated');
    if ($row['status'] !== 'active') tj_fail(403, 'account_suspended');
    return $row;
}

function tj_public_user(array $u): array {
    return [
        'id' => (string)$u['public_id'], 'display_id' => (string)$u['display_id'], 'email' => $u['email'],
        'first_name' => $u['first_name'], 'last_name' => $u['last_name'],
        'username' => $u['username'] ?? null, 'gender' => $u['gender'] ?? null, 'birth_date' => $u['birth_date'] ?? null,
        'email_verified' => $u['email_verified_at'] !== null,
        'verify_required' => $u['email_verified_at'] === null && (string)($u['created_at'] ?? '') >= TJ_VERIFY_REQUIRED_SINCE,
    ];
}

function tj_issue_email_token(int $userId, string $purpose, int $ttl): string {
    $token = tj_random_token();
    $db = tj_db();
    // One live link per purpose: older ones stop working.
    $db->prepare('UPDATE tj_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL')->execute([tj_now(), $userId, $purpose]);
    $db->prepare('INSERT INTO tj_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$userId, $purpose, tj_hash($token), tj_now($ttl), tj_now()]);
    return $token;
}

/* Marks a link token used and returns its user id, or fails. */
function tj_consume_email_token(string $token, string $purpose): int {
    $db = tj_db();
    $q = $db->prepare('SELECT id, user_id FROM tj_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?');
    $q->execute([tj_hash($token), $purpose, tj_now()]);
    $row = $q->fetch();
    if (!$row) tj_fail(400, 'invalid_or_expired_token');
    $db->prepare('UPDATE tj_tokens SET used_at = ? WHERE id = ?')->execute([tj_now(), $row['id']]);
    return (int)$row['user_id'];
}

/* ---- one-time email codes (reset password, confirm email) ----
 * 6 digits, 10 minutes, one live code per purpose, 5 wrong tries and it's
 * gone. Stored as an HMAC with the server's secret key (a 6-digit code
 * hashed plainly could be brute-forced from a leaked database). */
const TJ_CODE_TTL = 600;
const TJ_CODE_TRIES = 5;
// Accounts made from this moment on must confirm their email before using
// the app; older ones aren't locked out by the change.
const TJ_VERIFY_REQUIRED_SINCE = '2026-10-22 00:00:00';

function tj_code_hash(int $userId, string $purpose, string $code): string {
    return hash_hmac('sha256', "$userId|$purpose|$code", base64_decode(tj_secrets()['enc_key']));
}

/* Persian/Arabic digits and spaces are fine in what people type. */
function tj_clean_code(string $s): string {
    $s = strtr($s, ['۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9',
                    '٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9']);
    return preg_replace('/\D/', '', $s) ?? '';
}

function tj_issue_code(int $userId, string $purpose): string {
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $db = tj_db();
    $db->prepare('DELETE FROM tj_tokens WHERE user_id = ? AND purpose = ?')->execute([$userId, $purpose]);
    $db->prepare('INSERT INTO tj_tokens (user_id, purpose, token_hash, expires_at, created_at, attempts) VALUES (?, ?, ?, ?, ?, 0)')
        ->execute([$userId, $purpose, tj_code_hash($userId, $purpose, $code), tj_now(TJ_CODE_TTL), tj_now()]);
    return $code;
}

/* Uses up the code, or fails with invalid_code / code_expired. */
function tj_check_code(int $userId, string $purpose, string $code): void {
    $db = tj_db();
    $q = $db->prepare('SELECT id, token_hash, attempts FROM tj_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?');
    $q->execute([$userId, $purpose, tj_now()]);
    $row = $q->fetch();
    if (!$row || (int)$row['attempts'] >= TJ_CODE_TRIES) tj_fail(400, 'code_expired');
    if (strlen($code) !== 6 || !hash_equals($row['token_hash'], tj_code_hash($userId, $purpose, $code))) {
        $db->prepare('UPDATE tj_tokens SET attempts = attempts + 1 WHERE id = ?')->execute([$row['id']]);
        tj_fail(400, (int)$row['attempts'] + 1 >= TJ_CODE_TRIES ? 'code_expired' : 'invalid_code');
    }
    $db->prepare('UPDATE tj_tokens SET used_at = ? WHERE id = ?')->execute([tj_now(), $row['id']]);
}

/* ---- endpoints ---- */

function tj_register(): void {
    $b = tj_body();
    $email = strtolower(tj_str($b, 'email', 254));
    $password = is_string($b['password'] ?? null) ? $b['password'] : '';
    $username = strtolower(tj_str($b, 'username', 60));
    $gender = tj_str($b, 'gender', 10);
    $birth = tj_str($b, 'birth_date', 10);
    tj_throttle('register', tj_client_ip(), 10, 3600);
    $errors = [];
    if (!tj_valid_email($email)) $errors['email'] = ['Enter a valid email address.'];
    if (!tj_valid_username($username)) $errors['username'] = ['invalid'];
    if (!in_array($gender, ['female', 'male'], true)) $errors['gender'] = ['required'];
    if (!tj_valid_birth_date($birth)) $errors['birth_date'] = ['invalid'];
    $problems = tj_password_problems($password);
    if ($problems) tj_fail(400, 'weak_password', ['reasons' => $problems] + ($errors ? ['fields' => $errors] : []));
    if ($errors) tj_fail(400, 'validation_error', ['fields' => $errors]);

    $db = tj_db();
    $q = $db->prepare('SELECT id FROM tj_users WHERE email = ?');
    $q->execute([$email]);
    if ($q->fetch()) tj_fail(409, 'email_taken');
    $q = $db->prepare('SELECT id FROM tj_users WHERE username = ?');
    $q->execute([$username]);
    if ($q->fetch()) tj_fail(409, 'username_taken');

    $db->prepare('INSERT INTO tj_users (email, password_hash, first_name, last_name, username, gender, birth_date, public_id, display_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$email, password_hash($password, PASSWORD_DEFAULT), tj_str($b, 'first_name', 60), tj_str($b, 'last_name', 60), $username, $gender, $birth,
                   tj_new_public_id(), tj_new_display_id($db), tj_now(), tj_now()]);
    $userId = (int)$db->lastInsertId();

    // The app asks for this code straight after signing up (POST /auth/email/verify-code).
    tj_send_verify_code($email, tj_issue_code($userId, 'verify_code'));
    tj_json(tj_new_session($userId), 201);
}

function tj_login(): void {
    $b = tj_body();
    $email = strtolower(tj_str($b, 'email', 254));
    $password = is_string($b['password'] ?? null) ? $b['password'] : '';
    // Per address and per IP, so one account can't be guessed at and one
    // client can't sweep many accounts.
    tj_throttle('login_email', $email, 10, 900);
    tj_throttle('login_ip', tj_client_ip(), 30, 900);

    $q = tj_db()->prepare('SELECT * FROM tj_users WHERE email = ?');
    $q->execute([$email]);
    $user = $q->fetch();
    // Same answer (and similar time) whether or not the address exists.
    $hash = $user ? $user['password_hash'] : tj_dummy_hash();
    if (!password_verify($password, $hash) || !$user) tj_fail(401, 'invalid_credentials');
    if ($user['status'] !== 'active') tj_fail(403, 'account_suspended');
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        tj_db()->prepare('UPDATE tj_users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    tj_json(tj_new_session((int)$user['id']));
}

function tj_refresh(): void {
    $b = tj_body();
    $token = tj_str($b, 'refresh_token', 200);
    $db = tj_db();
    $q = $db->prepare('SELECT s.*, u.status FROM tj_sessions s JOIN tj_users u ON u.id = s.user_id WHERE s.refresh_hash = ?');
    $q->execute([tj_hash($token)]);
    $s = $q->fetch();
    if (!$s || $s['revoked_at'] !== null || $s['refresh_expires'] <= tj_now()) {
        // A rotated (already used) refresh token coming back means it was
        // copied: end every session of that account.
        if ($s && $s['revoked_at'] !== null) $db->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')->execute([tj_now(), $s['user_id']]);
        tj_fail(401, 'invalid_refresh_token');
    }
    if ($s['status'] !== 'active') tj_fail(403, 'account_suspended');
    $db->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE id = ?')->execute([tj_now(), $s['id']]);
    tj_json(tj_new_session((int)$s['user_id']));
}

function tj_logout(): void {
    $u = tj_require_user();
    tj_db()->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE id = ?')->execute([tj_now(), $u['session_id']]);
    tj_json(['ok' => true]);
}

function tj_forgot_password(): void {
    $b = tj_body();
    $email = strtolower(tj_str($b, 'email', 254));
    tj_throttle('forgot', $email . '|' . tj_client_ip(), 5, 3600);
    $q = tj_db()->prepare('SELECT id, email FROM tj_users WHERE email = ? AND status = ?');
    $q->execute([$email, 'active']);
    $user = $q->fetch();
    if ($user) tj_send_reset_code($user['email'], tj_issue_code((int)$user['id'], 'reset_code'));
    // Never reveal whether an address has an account.
    tj_json(['ok' => true]);
}

/* POST /auth/password/code {email, code} — the code from the email; gives
 * back a short-lived token for POST /auth/password/reset. */
function tj_reset_code(): void {
    $b = tj_body();
    $email = strtolower(tj_str($b, 'email', 254));
    tj_throttle('reset_code', $email . '|' . tj_client_ip(), 10, 900);
    tj_throttle('reset_code_ip', tj_client_ip(), 30, 900);
    $q = tj_db()->prepare('SELECT id FROM tj_users WHERE email = ? AND status = ?');
    $q->execute([$email, 'active']);
    $user = $q->fetch();
    if (!$user) tj_fail(400, 'code_expired'); // same as an address with no live code
    tj_check_code((int)$user['id'], 'reset_code', tj_clean_code(tj_str($b, 'code', 40)));
    tj_json(['token' => tj_issue_email_token((int)$user['id'], 'reset', 900)]);
}

/* POST /auth/email/verify-code {code} — signed in, straight after sign-up. */
function tj_verify_code(): void {
    $u = tj_require_user();
    if ($u['email_verified_at'] !== null) tj_json(['ok' => true]);
    tj_throttle('verify_code', (string)$u['id'], 15, 900);
    tj_check_code((int)$u['id'], 'verify_code', tj_clean_code(tj_str(tj_body(), 'code', 40)));
    tj_db()->prepare('UPDATE tj_users SET email_verified_at = ?, updated_at = ? WHERE id = ?')->execute([tj_now(), tj_now(), $u['id']]);
    tj_json(['ok' => true]);
}

/* POST /auth/email/resend — a new confirmation code. */
function tj_resend_verify(): void {
    $u = tj_require_user();
    if ($u['email_verified_at'] !== null) tj_json(['ok' => true]);
    tj_throttle('verify_resend', (string)$u['id'], 4, 900);
    tj_send_verify_code($u['email'], tj_issue_code((int)$u['id'], 'verify_code'));
    tj_json(['ok' => true]);
}

function tj_reset_password(): void {
    $b = tj_body();
    $password = is_string($b['password'] ?? null) ? $b['password'] : '';
    $problems = tj_password_problems($password);
    if ($problems) tj_fail(400, 'weak_password', ['reasons' => $problems]);
    $userId = tj_consume_email_token(tj_str($b, 'token', 200), 'reset');
    $db = tj_db();
    $db->prepare('UPDATE tj_users SET password_hash = ?, updated_at = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), tj_now(), $userId]);
    // A new password signs every device out.
    $db->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')->execute([tj_now(), $userId]);
    tj_json(['ok' => true]);
}

function tj_verify_email(): void {
    $b = tj_body();
    $userId = tj_consume_email_token(tj_str($b, 'token', 200), 'verify');
    tj_db()->prepare('UPDATE tj_users SET email_verified_at = ?, updated_at = ? WHERE id = ? AND email_verified_at IS NULL')->execute([tj_now(), tj_now(), $userId]);
    tj_json(['ok' => true]);
}

const TJ_HEARTBEAT = 60;  // the app pings this often while open
const TJ_ONLINE_WINDOW = 150; // seen this recently = online now

/* GET /me/profile/username-available?username=… — same path and answer as
 * the Django API: is it free (my own counts as free)? Checked again on save. */
function tj_username_available(): void {
    $u = tj_require_user();
    tj_throttle('username_check', (string)$u['id'], 60, 60);
    $name = strtolower(trim((string)($_GET['username'] ?? '')));
    if (!tj_valid_username($name)) tj_json(['username' => $name, 'available' => false, 'valid' => false]);
    $q = tj_db()->prepare('SELECT 1 FROM tj_users WHERE username = ? AND id <> ?');
    $q->execute([$name, $u['id']]);
    tj_json(['username' => $name, 'available' => !$q->fetch(), 'valid' => true]);
}

/* The app is open: remember when, and add the time since the last ping
 * (only if it was recent, so a closed app doesn't count). */
function tj_heartbeat(): void {
    $u = tj_require_user();
    $gap = $u['last_seen_at'] ? time() - strtotime($u['last_seen_at'] . ' UTC') : PHP_INT_MAX;
    $add = ($gap > 0 && $gap <= 2 * TJ_HEARTBEAT) ? $gap : 0;
    try {
        tj_db()->prepare('UPDATE tj_users SET last_seen_at = ?, active_seconds = active_seconds + ? WHERE id = ?')
            ->execute([tj_now(), $add, $u['id']]);
    } catch (PDOException $e) { /* database busy: the next ping counts it */ }
    tj_json(['ok' => true, 'next_in' => TJ_HEARTBEAT]);
}

function tj_me(): void {
    tj_json(tj_public_user(tj_require_user()));
}

/* PATCH /me: only the fields sent change.
 * - username: same rules as sign-up, and unique.
 * - gender, birth_date: can be set once (accounts made before sign-up
 *   asked for them); after that they're fixed and changes are refused.
 * - first_name, last_name: free. Email can't be changed here. */
function tj_update_me(): void {
    $u = tj_require_user();
    $b = tj_body();
    $db = tj_db();
    $set = [];
    foreach (['first_name', 'last_name'] as $k) if (array_key_exists($k, $b)) $set[$k] = tj_str($b, $k, 60);
    if (array_key_exists('username', $b)) {
        $username = strtolower(tj_str($b, 'username', 60));
        if (!tj_valid_username($username)) tj_fail(400, 'validation_error', ['fields' => ['username' => ['invalid']]]);
        $q = $db->prepare('SELECT 1 FROM tj_users WHERE username = ? AND id <> ?');
        $q->execute([$username, $u['id']]);
        if ($q->fetch()) tj_fail(409, 'username_taken');
        $set['username'] = $username;
    }
    if (array_key_exists('gender', $b)) {
        $g = tj_str($b, 'gender', 10);
        if ($u['gender'] !== null && $u['gender'] !== '' && $g !== $u['gender']) tj_fail(409, 'locked', ['field' => 'gender']);
        if (!in_array($g, ['female', 'male'], true)) tj_fail(400, 'validation_error', ['fields' => ['gender' => ['invalid']]]);
        $set['gender'] = $g;
    }
    if (array_key_exists('birth_date', $b)) {
        $d = tj_str($b, 'birth_date', 10);
        if ($u['birth_date'] !== null && $u['birth_date'] !== '' && $d !== $u['birth_date']) tj_fail(409, 'locked', ['field' => 'birth_date']);
        if (!tj_valid_birth_date($d)) tj_fail(400, 'validation_error', ['fields' => ['birth_date' => ['invalid']]]);
        $set['birth_date'] = $d;
    }
    if ($set) {
        $cols = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($set)));
        $db->prepare("UPDATE tj_users SET $cols, updated_at = ? WHERE id = ?")->execute(array_merge(array_values($set), [tj_now(), $u['id']]));
        $u = array_merge($u, $set);
    }
    tj_json(tj_public_user($u));
}

/* POST /me/password: the current password and a new one; every other
 * device is signed out, this one stays signed in. */
function tj_change_password(): void {
    $u = tj_require_user();
    $b = tj_body();
    tj_throttle('password_change', (string)$u['id'], 10, 3600);
    $current = is_string($b['current_password'] ?? null) ? $b['current_password'] : '';
    if (!password_verify($current, $u['password_hash'])) tj_fail(401, 'invalid_credentials');
    $new = is_string($b['new_password'] ?? null) ? $b['new_password'] : '';
    if ($problems = tj_password_problems($new)) tj_fail(400, 'weak_password', ['reasons' => $problems]);
    $db = tj_db();
    $db->prepare('UPDATE tj_users SET password_hash = ?, updated_at = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), tj_now(), $u['id']]);
    $db->prepare('UPDATE tj_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL')->execute([tj_now(), $u['id'], $u['session_id']]);
    tj_json(['ok' => true]);
}

/* Deleting the account removes the user row; sessions, tokens and the
 * synced data go with it (ON DELETE CASCADE). Needs the password. */
function tj_delete_me(): void {
    $u = tj_require_user();
    $b = tj_body();
    $password = is_string($b['password'] ?? null) ? $b['password'] : '';
    if (!password_verify($password, $u['password_hash'])) tj_fail(401, 'invalid_credentials');
    tj_db()->prepare('DELETE FROM tj_users WHERE id = ?')->execute([$u['id']]);
    tj_json(['ok' => true]);
}
