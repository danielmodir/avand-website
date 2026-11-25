<?php
declare(strict_types=1);

$dir = sys_get_temp_dir() . '/toojibee-gcal-' . bin2hex(random_bytes(6));
if (!mkdir($dir, 0700)) throw new RuntimeException('temp directory');
$cfg = [
    'db_dsn' => 'sqlite:' . $dir . '/test.sqlite',
    'google_client_id' => 'test-client',
    'google_client_secret' => 'test-secret',
    'google_calendar_redirect_uri' => 'https://example.test/api/v1/calendar/google/callback',
    'app_url' => 'https://example.test/demo/',
];
file_put_contents($dir . '/config.php', '<?php return ' . var_export($cfg, true) . ';');
file_put_contents($dir . '/secrets.php', '<?php return ' . var_export(['enc_key' => base64_encode(random_bytes(32))], true) . ';');
putenv('TJ_CONFIG=' . $dir . '/config.php');
putenv('TJ_SECRETS=' . $dir . '/secrets.php');
putenv('TJ_DATA_DIR=' . $dir);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/google_calendar.php';

function check(bool $ok, string $why): void { if (!$ok) throw new RuntimeException($why); }
try {
    $db = tj_db();
    check((int)$db->query('SELECT MAX(version) FROM tj_schema')->fetchColumn() === 30, 'schema version');
    check($db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='tj_google_calendar_links'")->fetchColumn() === 'tj_google_calendar_links', 'link table');
    $db->prepare('INSERT INTO tj_users (email,password_hash,public_id,display_id,created_at,updated_at) VALUES (?,?,?,?,?,?)')
       ->execute(['calendar@example.test', '!', bin2hex(random_bytes(16)), 'TJ-GCAL1234', tj_now(), tj_now()]);
    $uid = (int)$db->lastInsertId();
    $state = tj_random_token();
    $verifier = tj_random_token();
    $url = tj_google_calendar_authorize_url($state, $verifier, tj_config());
    parse_str((string)parse_url($url, PHP_URL_QUERY), $params);
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    check($params['scope'] === TJ_CALENDAR_SCOPE && $params['access_type'] === 'offline', 'narrow offline scope');
    check($params['state'] === $state && $params['code_challenge'] === $challenge, 'state and PKCE');
    check(strpos($url, 'test-secret') === false, 'client secret in authorize URL');

    $encrypted = tj_encrypt($verifier);
    check($encrypted !== $verifier && tj_decrypt($encrypted) === $verifier, 'encrypted verifier');
    $db->prepare('INSERT INTO tj_google_calendar_flows (state_hash,user_id,verifier_enc,expires_at) VALUES (?,?,?,?)')
       ->execute([tj_hash($state), $uid, $encrypted, tj_now(600)]);
    $taken = tj_google_calendar_take_flow($state);
    check((int)$taken['user_id'] === $uid && tj_decrypt($taken['verifier_enc']) === $verifier, 'bound flow');
    check(tj_google_calendar_take_flow($state) === null, 'one-use state');
    check(tj_google_calendar_take_flow('invalid') === null, 'invalid state');
    tj_google_calendar_save_grant($uid, 'first-refresh');
    $stored = $db->query('SELECT refresh_token_enc FROM tj_google_calendar_grants')->fetchColumn();
    check($stored !== 'first-refresh' && tj_decrypt($stored) === 'first-refresh', 'encrypted grant persisted');
    tj_google_calendar_save_grant($uid, 'new-refresh');
    check((int)$db->query('SELECT COUNT(*) FROM tj_google_calendar_grants')->fetchColumn() === 1, 'grant updated in place');
    check(tj_decrypt($db->query('SELECT refresh_token_enc FROM tj_google_calendar_grants')->fetchColumn()) === 'new-refresh', 'new grant persisted');
    echo "Google Calendar grant: PASS\n";
} finally {
    foreach (glob($dir . '/*') ?: [] as $file) unlink($file);
    rmdir($dir);
}
