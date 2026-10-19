<?php
/* Serves /fa/ and /en/ on the live host: the static landing page with
 * whatever the admin panel changed (hero text, screenshots) put in
 * server-side (lib/content.php), so the browser still gets one plain
 * HTML page and makes no extra request. If anything goes wrong it sends
 * the static page unchanged. GitHub Pages never reaches this file. */
declare(strict_types=1);

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$file = dirname(__DIR__) . "/$lang/index.html";
$html = (string)@file_get_contents($file);

try {
    require __DIR__ . '/lib/bootstrap.php';
    require __DIR__ . '/lib/content.php';
    $html = tj_render_landing($html, $lang);
} catch (Throwable $e) {
    error_log('[toojibee-page] ' . $e->getMessage());
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
