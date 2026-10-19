<?php
/* Serves the admin panel page, only at its secret address
 * (https://toojibee.ir/<panel_slug>/, see lib/admin.php); every other
 * path that reaches this file gets the site's normal 404 page. The page
 * itself is panel/panel.html: inline script and styles, allowed by a
 * per-request nonce in a strict Content-Security-Policy. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/admin.php';

$path = trim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

if (!hash_equals(tj_admin_settings()['panel_slug'], $path)) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile(dirname(__DIR__) . '/404.html');
    exit;
}

$nonce = base64_encode(random_bytes(16));
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; script-src 'nonce-$nonce'; style-src 'self' 'nonce-$nonce'; "
     . "font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
echo str_replace('{{NONCE}}', $nonce, (string)file_get_contents(__DIR__ . '/panel/panel.html'));
