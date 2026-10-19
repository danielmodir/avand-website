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

    $token = tj_issue_email_token($userId, 'verify', 7 * 86400);
    tj_send_verify_email($email, $token);
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
    if ($user) tj_send_reset_email($user['email'], tj_issue_email_token((int)$user['id'], 'reset', 3600));
    // Never reveal whether an address has an account.
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

function tj_me(): void {
    tj_json(tj_public_user(tj_require_user()));
}

function tj_update_me(): void {
    $u = tj_require_user();
    $b = tj_body();
    tj_db()->prepare('UPDATE tj_users SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?')
        ->execute([tj_str($b, 'first_name', 60), tj_str($b, 'last_name', 60), tj_now(), $u['id']]);
    $u['first_name'] = tj_str($b, 'first_name', 60);
    $u['last_name'] = tj_str($b, 'last_name', 60);
    tj_json(tj_public_user($u));
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
