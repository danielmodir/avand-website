<?php
declare(strict_types=1);
function tj_fail(int $status, string $error): never { throw new RuntimeException("$status:$error"); }
require __DIR__ . '/../lib/sync.php';
$window = ['type' => 'repeat', 'time' => '08:00', 'windowEnd' => '18:00', 'everyMinutes' => 30];
foreach (['tasks', 'habits', 'events'] as $kind) {
    tj_validate_reminder_windows([$kind => [['notification' => $window]]]);
    tj_validate_reminder_windows([$kind => [['notification' => array_replace($window, ['time' => '22:00', 'windowEnd' => '02:00'])]]]);
}
tj_validate_reminder_windows(['tasks' => [['notification' => ['type' => 'repeat', 'repeatHours' => 2]]]]);
foreach ([['everyMinutes' => 0], ['everyMinutes' => -1], ['everyMinutes' => 1.5], ['everyMinutes' => 1441], ['windowEnd' => '08:00'], ['time' => '24:00']] as $invalid) {
    try {
        tj_validate_reminder_windows(['tasks' => [['notification' => array_replace($window, $invalid)]]]);
    } catch (RuntimeException $e) {
        if ($e->getMessage() === '400:reminder_window_invalid') continue;
        throw $e;
    }
    throw new RuntimeException('Invalid reminder window accepted');
}
echo "Reminder windows: PASS\n";
