<?php
/* Router for https://toojibee.ir/api/v1/* (the .htaccess one level up
 * sends every /api/v1/ path here). Endpoint names match the Django API
 * where they overlap, so the app's auth code works unchanged. */
declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/auth.php';
require __DIR__ . '/../lib/sync.php';
require __DIR__ . '/../lib/mail.php';

set_exception_handler(function (Throwable $e) {
    error_log('[toojibee-api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    tj_fail(500, 'server_error');
});

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = '/' . trim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
$path = preg_replace('#^.*?/api/v1#', '', $path) ?: '/';

$routes = [
    'GET /health'               => function () { tj_db(); tj_json(['ok' => true, 'backend' => 'php']); },
    'GET /auth/providers'       => function () { tj_json(['password' => true, 'google' => false]); },
    'POST /auth/register'       => 'tj_register',
    'POST /auth/login'          => 'tj_login',
    'POST /auth/refresh'        => 'tj_refresh',
    'POST /auth/logout'         => 'tj_logout',
    'POST /auth/password/forgot'=> 'tj_forgot_password',
    'POST /auth/password/reset' => 'tj_reset_password',
    'POST /auth/email/verify'   => 'tj_verify_email',
    'GET /me'                   => 'tj_me',
    'PATCH /me'                 => 'tj_update_me',
    'POST /me/delete'           => 'tj_delete_me',
    'GET /sync'                 => 'tj_sync_get',
    'PUT /sync'                 => 'tj_sync_put',
];

$handler = $routes["$method $path"] ?? null;
if ($handler === null) {
    $known = array_filter(array_keys($routes), function ($r) use ($path) { return substr($r, strpos($r, ' ') + 1) === $path; });
    tj_fail($known ? 405 : 404, $known ? 'method_not_allowed' : 'not_found');
}
$handler();
