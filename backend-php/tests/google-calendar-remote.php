<?php
declare(strict_types=1);
require __DIR__ . '/../lib/google_calendar_remote.php';

function check_remote(bool $ok, string $why): void {
    if (!$ok) throw new RuntimeException($why);
}
function expect_remote_error(callable $run, string $code): void {
    try { $run(); }
    catch (DomainException $e) {
        check_remote($e->getMessage() === $code, 'wrong error: ' . $e->getMessage());
        return;
    }
    throw new RuntimeException('expected error: ' . $code);
}

$calls = [];
$rows = tj_gcal_read_pages(function ($token) use (&$calls) {
    $calls[] = $token;
    return $token === null
        ? ['items' => [['id' => 'first']], 'nextPageToken' => 'opaque']
        : ['items' => [['id' => 'second']]];
});
check_remote($calls === [null, 'opaque'] && array_column($rows, 'id') === ['first', 'second'], 'pagination');
check_remote(tj_gcal_read_pages(fn($token) => []) === [], 'empty calendar');
expect_remote_error(fn() => tj_gcal_read_pages(fn($token) => ['items' => [], 'nextPageToken' => 'same']), 'google_calendar_bad_response');
expect_remote_error(fn() => tj_gcal_read_pages(fn($token) => ['items' => ['invalid']]), 'google_calendar_bad_response');
expect_remote_error(fn() => tj_gcal_read_pages(fn($token) => ['items' => array_fill(0, 10001, ['id' => 'x'])]), 'google_calendar_too_many_events');
echo "Google Calendar remote pagination: PASS\n";
