<?php
/* Sends the reminders that are due (lib/push.php). Run by the host's cron
 * every minute:
 *   php /home/<account>/public_html/api/push-cron.php
 * Command line only — the web gets a 403 from api/.htaccess, and a 404
 * here if that's ever missing. */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/push.php';

// One run at a time; a run that takes over a minute isn't doubled.
$lock = fopen(tj_data_dir() . '/push-cron.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);
try {
    $s = tj_push_run();
    // Quiet unless asked: cron mails whatever a job prints.
    if (in_array('-v', $argv ?? [], true)) echo json_encode($s), "\n";
} catch (Throwable $e) {
    error_log('[toojibee-push] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    exit(1);
} finally {
    flock($lock, LOCK_UN);
}
