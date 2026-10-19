<?php
/* Router for https://toojibee.ir/api/v1/* (the .htaccess one level up
 * sends every /api/v1/ path here). Endpoint names match the Django API
 * where they overlap, so the app's auth code works unchanged. */
declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/auth.php';
require __DIR__ . '/../lib/sync.php';
require __DIR__ . '/../lib/mail.php';
require __DIR__ . '/../lib/admin.php';
require __DIR__ . '/../lib/admin_users.php';
require __DIR__ . '/../lib/admin_visits.php';
require __DIR__ . '/../lib/admin_system.php';
require __DIR__ . '/../lib/content.php';

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
    'POST /me/heartbeat'        => 'tj_heartbeat',
    'GET /sync'                 => 'tj_sync_get',
    'PUT /sync'                 => 'tj_sync_put',
    // Admin panel (lib/admin.php): 404 unless the X-TJ-Panel header
    // carries the panel's secret address.
    'GET /admin/state'          => 'tj_admin_state',
    'POST /admin/setup'         => 'tj_admin_setup',
    'POST /admin/login'         => 'tj_admin_login',
    'POST /admin/logout'        => 'tj_admin_logout',
    'POST /admin/invite/accept' => 'tj_admin_accept_invite',
    'GET /admin/overview'       => 'tj_admin_overview',
    'GET /admin/audit'          => 'tj_admin_audit_list',
    'GET /admin/admins'         => 'tj_admin_list',
    'POST /admin/admins'        => 'tj_admin_create',
    'GET /admin/users'          => 'tj_admin_users',
    'GET /admin/backup'         => 'tj_admin_backup',
    'GET /admin/visits'         => 'tj_admin_visits',
    'GET /content'              => 'tj_public_content',
    'GET /admin/content'        => 'tj_admin_content',
    'PUT /admin/content'        => 'tj_admin_content_save',
    'POST /admin/content/image' => 'tj_admin_content_image',
    'POST /admin/content/image/reset' => 'tj_admin_content_image_reset',
    'GET /admin/system'         => 'tj_admin_system',
    'POST /admin/system/cleanup'=> 'tj_admin_system_cleanup',
    'POST /admin/system/check'  => 'tj_admin_system_check',
];
// Unknown /admin/ paths look exactly like any other unknown path.
if (strpos($path, '/admin/') === 0) tj_admin_gate();
// One admin: /admin/admins/<public id> (PATCH) and .../delete (POST).
if (preg_match('#^/admin/admins/([a-f0-9]{32})(/delete)?$#', $path, $m)) {
    if ($method === 'PATCH' && empty($m[2])) tj_admin_update($m[1]);
    if ($method === 'POST' && !empty($m[2])) tj_admin_remove($m[1]);
    tj_fail(405, 'method_not_allowed');
}
// One account: /admin/users/<public id>[/suspend|/signout|/delete].
if (preg_match('#^/admin/users/([a-f0-9]{32})(?:/(suspend|signout|delete))?$#', $path, $m)) {
    $act = $m[2] ?? '';
    if ($method === 'GET' && $act === '') tj_admin_user_detail($m[1]);
    if ($method === 'POST' && $act === 'suspend') tj_admin_user_suspend($m[1]);
    if ($method === 'POST' && $act === 'signout') tj_admin_user_signout($m[1]);
    if ($method === 'POST' && $act === 'delete') tj_admin_user_delete($m[1]);
    tj_fail(405, 'method_not_allowed');
}

$handler = $routes["$method $path"] ?? null;
if ($handler === null) {
    $known = array_filter(array_keys($routes), function ($r) use ($path) { return substr($r, strpos($r, ' ') + 1) === $path; });
    tj_fail($known ? 405 : 404, $known ? 'method_not_allowed' : 'not_found');
}
$handler();
