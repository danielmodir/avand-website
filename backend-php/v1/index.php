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
require __DIR__ . '/../lib/articles.php';
require __DIR__ . '/../lib/calendar.php';
require __DIR__ . '/../lib/social.php';
require __DIR__ . '/../lib/push.php';
require __DIR__ . '/../lib/support.php';
require __DIR__ . '/../lib/notices.php';
require __DIR__ . '/../lib/groups.php';
require __DIR__ . '/../lib/mcp.php';
require __DIR__ . '/../lib/stats.php';

set_exception_handler(function (Throwable $e) {
    error_log('[toojibee-api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    tj_fail(500, 'server_error');
});

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = '/' . trim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
$path = preg_replace('#^.*?/api/v1#', '', $path) ?: '/';

$routes = [
    'GET /health'               => function () { tj_db(); tj_json(['ok' => true, 'backend' => 'php']); },
    'POST /stats'               => 'tj_stats_post',        // anonymous, opt-in counts (lib/stats.php)
    'GET /auth/providers'       => function () { tj_json(['password' => true, 'google' => false]); },
    'POST /auth/register'       => 'tj_register',
    'POST /auth/login'          => 'tj_login',
    'POST /auth/refresh'        => 'tj_refresh',
    'POST /auth/logout'         => 'tj_logout',
    'POST /auth/password/forgot'=> 'tj_forgot_password',
    'POST /auth/password/reset' => 'tj_reset_password',
    'POST /auth/email/verify'   => 'tj_verify_email',
    'POST /auth/password/code'  => 'tj_reset_code',
    'POST /auth/email/code'     => 'tj_email_code',        // the sign-up code -> signed in
    'POST /auth/email/code/resend' => 'tj_email_code_resend',
    'GET /me'                   => 'tj_me',
    'PATCH /me'                 => 'tj_update_me',
    'POST /me/delete'           => 'tj_delete_me',
    'POST /me/heartbeat'        => 'tj_heartbeat',
    'POST /me/password'         => 'tj_change_password',
    'GET /me/profile/username-available' => 'tj_username_available',
    'GET /social/search'        => 'tj_social_search',
    'GET /social/connections'   => 'tj_social_list',
    'GET /social/invite'        => 'tj_social_invite',
    'POST /social/invite/reset' => 'tj_social_invite_reset',
    'POST /social/invite/accept'=> 'tj_social_invite_accept',
    'GET /groups'               => 'tj_groups_list',
    'POST /groups'              => 'tj_group_create',
    'POST /groups/join'         => 'tj_group_join',
    'GET /period/shares'        => 'tj_period_shares_get',
    'PUT /period/shares'        => 'tj_period_shares_put',
    'GET /period/shared-with-me'=> 'tj_period_shared_with_me',
    'POST /support/messages'    => 'tj_support_send',
    'GET /support/messages'     => 'tj_support_mine',
    'GET /support/unread'       => 'tj_support_unread',
    'GET /me/notices'           => 'tj_notices_mine',
    'POST /me/notices/seen'     => 'tj_notices_seen',
    'GET /admin/notices'        => 'tj_admin_notices',
    'POST /admin/notices'       => 'tj_admin_notice_send',
    'GET /admin/notices/preview'=> 'tj_admin_notice_preview',
    'GET /admin/messages'       => 'tj_admin_messages',
    'GET /admin/messages/canned'=> 'tj_admin_canned_get',
    'PUT /admin/messages/canned'=> 'tj_admin_canned_put',
    'GET /notifications/push-key'      => 'tj_push_key',
    'POST /notifications/subscriptions'=> 'tj_push_subscribe',
    'PUT /notifications/schedule'      => 'tj_push_schedule',
    'GET /me/mcp'               => 'tj_mcp_link_get',
    'POST /me/mcp'              => 'tj_mcp_link_create',
    'DELETE /me/mcp'            => 'tj_mcp_link_delete',
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
    'GET /admin/stats'          => 'tj_admin_stats',
    'GET /content'              => 'tj_public_content',
    'GET /articles/featured'    => 'tj_public_featured_articles',
    'GET /articles'             => 'tj_public_articles',
    'GET /calendar/hijri-months'=> 'tj_public_hijri_months',
    'GET /admin/calendar/hijri-months' => 'tj_admin_hijri_months',
    'PUT /admin/calendar/hijri-months' => 'tj_admin_hijri_months_save',
    'GET /admin/content'        => 'tj_admin_content',
    'PUT /admin/content'        => 'tj_admin_content_save',
    'POST /admin/content/image' => 'tj_admin_content_image',
    'POST /admin/content/image/reset' => 'tj_admin_content_image_reset',
    'GET /admin/articles'       => 'tj_admin_articles',
    'POST /admin/articles'      => 'tj_admin_article_create',
    'GET /admin/system'         => 'tj_admin_system',
    'GET /admin/system/table'   => 'tj_admin_system_table',
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
// One article: /admin/articles/<public id> (GET, PATCH) and .../<action> (POST).
if (preg_match('#^/admin/articles/([a-f0-9]{32})(?:/(submit|approve|reject|unpublish|delete|cover|cover-remove))?$#', $path, $m)) {
    $act = $m[2] ?? '';
    if ($method === 'GET' && $act === '') tj_admin_article($m[1]);
    if ($method === 'PATCH' && $act === '') tj_admin_article_update($m[1]);
    if ($method === 'POST' && $act !== '') tj_admin_article_action($m[1], $act);
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

// Friends (lib/social.php): /social/connections/<public id>[/request|/respond]
// and /social/blocks/<public id>.
if (preg_match('#^/social/(connections|blocks)/([a-f0-9]{32})(?:/(request|respond))?$#', $path, $m)) {
    $act = $m[3] ?? '';
    if ($m[1] === 'connections') {
        if ($method === 'POST' && $act === 'request') tj_social_request($m[2]);
        if ($method === 'POST' && $act === 'respond') tj_social_respond($m[2]);
        if ($method === 'DELETE' && $act === '') tj_social_remove($m[2]);
    } elseif ($act === '') {
        if ($method === 'PUT') tj_social_block($m[2]);
        if ($method === 'DELETE') tj_social_unblock($m[2]);
    }
    tj_fail(405, 'method_not_allowed');
}

// Group planning (lib/groups.php): /groups/<id>[/leave|/invite/reset] and
// /groups/<id>/items/<item id>[/marks].
if (preg_match('#^/groups/([a-f0-9]{32})(?:/(leave|invite/reset)|/items/([A-Za-z0-9-]{8,64})(/marks)?)?$#', $path, $m)) {
    $act = $m[2] ?? ''; $item = $m[3] ?? ''; $marks = !empty($m[4]);
    if ($item !== '') {
        if ($marks && $method === 'PUT') tj_group_item_mark($m[1], $item);
        if (!$marks && $method === 'PUT') tj_group_item_put($m[1], $item);
        if (!$marks && $method === 'DELETE') tj_group_item_delete($m[1], $item);
    } elseif ($act === 'leave') {
        if ($method === 'POST') tj_group_leave($m[1]);
    } elseif ($act === 'invite/reset') {
        if ($method === 'POST') tj_group_invite_reset($m[1]);
    } else {
        if ($method === 'PATCH') tj_group_update($m[1]);
        if ($method === 'DELETE') tj_group_delete($m[1]);
    }
    tj_fail(405, 'method_not_allowed');
}

// "Contact us" in the panel: /admin/messages/<public id>/(reply|close|reopen).
if (preg_match('#^/admin/messages/([a-f0-9]{32})/(reply|close|reopen)$#', $path, $m)) {
    if ($method === 'POST') tj_admin_message_action($m[1], $m[2]);
    tj_fail(405, 'method_not_allowed');
}
// Web Push: /notifications/subscriptions/<public id> (DELETE).
if (preg_match('#^/notifications/subscriptions/([a-f0-9]{32})$#', $path, $m)) {
    if ($method === 'DELETE') tj_push_unsubscribe($m[1]);
    tj_fail(405, 'method_not_allowed');
}

// The person's MCP server (lib/mcp.php): the personal link, or the key as a Bearer token.
if (preg_match('#^/mcp/u/([A-Za-z0-9_-]{8,100})$#', $path, $m)) tj_mcp_handle($m[1]);
if ($path === '/mcp') tj_mcp_handle();

$handler = $routes["$method $path"] ?? null;
if ($handler === null) {
    $known = array_filter(array_keys($routes), function ($r) use ($path) { return substr($r, strpos($r, ' ') + 1) === $path; });
    tj_fail($known ? 405 : 404, $known ? 'method_not_allowed' : 'not_found');
}
$handler();
