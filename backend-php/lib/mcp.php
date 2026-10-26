<?php
/* "Connect to AI": each person's own MCP server (Streamable HTTP
 * transport), so Claude Code, Claude and other MCP clients can read and
 * change that person's tasks, habits and events.
 *
 *   POST /api/v1/mcp/u/<key>   the personal link (Profile → Connect to AI)
 *   POST /api/v1/mcp           the same, with "Authorization: Bearer <key>"
 *   GET/POST/DELETE /me/mcp    the app: show, make (replaces) or remove the link
 *
 * The key is the only credential: whoever has the link acts as the person,
 * so it is stored hashed (lookup) and encrypted (Profile shows it again),
 * and a new one kills the old. Tools work on the same synced document as
 * the app (lib/sync.php), in one write transaction that bumps its version,
 * so a device holding an older copy merges instead of silently winning.
 * The period part is never read or sent, and group items (lib/groups.php)
 * aren't in the document. Dates are Gregorian YYYY-MM-DD, "today" is Iran
 * time. Same tools in Django: backend/apps/core/mcp.py.
 */
declare(strict_types=1);

require_once __DIR__ . '/dates.php';

const TJ_MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const TJ_MCP_TZ = 'Asia/Tehran';
const TJ_MCP_LISTS = ['task' => 'tasks', 'habit' => 'habits', 'event' => 'events'];
const TJ_MCP_KEY_PREFIX = 'tjm_';

final class TjMcpToolError extends Exception {}

/* ---- the personal link (the app) ---- */

function tj_mcp_base_url(): string {
    $u = parse_url(tj_config()['app_url']) ?: [];
    $port = isset($u['port']) ? ':' . $u['port'] : '';
    return ($u['scheme'] ?? 'https') . '://' . ($u['host'] ?? 'toojibee.ir') . $port . '/api/v1/mcp/u/';
}

function tj_mcp_link_state(int $userId): array {
    $q = tj_db()->prepare('SELECT key_enc, created_at, last_used_at FROM tj_mcp_keys WHERE user_id = ?');
    $q->execute([$userId]);
    $r = $q->fetch();
    $key = $r ? tj_decrypt($r['key_enc']) : null;
    if ($key === null) return ['connected' => false, 'url' => null, 'created_at' => null, 'last_used_at' => null];
    return ['connected' => true, 'url' => tj_mcp_base_url() . $key, 'created_at' => $r['created_at'], 'last_used_at' => $r['last_used_at']];
}

function tj_mcp_link_get(): void {
    $u = tj_require_user();
    tj_json(tj_mcp_link_state((int)$u['id']));
}

function tj_mcp_link_create(): void {
    $u = tj_require_user();
    tj_throttle('mcp_link', (string)$u['id'], 10, 3600);
    $key = TJ_MCP_KEY_PREFIX . tj_random_token();
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $db->prepare('DELETE FROM tj_mcp_keys WHERE user_id = ?')->execute([$u['id']]);
        $db->prepare('INSERT INTO tj_mcp_keys (user_id, key_hash, key_enc, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$u['id'], tj_hash($key), tj_encrypt($key), tj_now()]);
        tj_tx_commit($db);
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        throw $e;
    }
    tj_json(tj_mcp_link_state((int)$u['id']));
}

function tj_mcp_link_delete(): void {
    $u = tj_require_user();
    tj_db()->prepare('DELETE FROM tj_mcp_keys WHERE user_id = ?')->execute([$u['id']]);
    tj_json(tj_mcp_link_state((int)$u['id']));
}

/* The account a key belongs to, or null (unknown, removed, suspended). */
function tj_mcp_user(?string $key): ?array {
    if ($key === null) {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer\s+(\S+)$/', $h, $m)) $key = $m[1];
    }
    if ($key === null || strpos($key, TJ_MCP_KEY_PREFIX) !== 0 || strlen($key) > 100) return null;
    $q = tj_db()->prepare('SELECT u.* FROM tj_mcp_keys k JOIN tj_users u ON u.id = k.user_id WHERE k.key_hash = ?');
    $q->execute([tj_hash($key)]);
    $u = $q->fetch();
    if (!$u || $u['status'] !== 'active') return null;
    tj_db()->prepare('UPDATE tj_mcp_keys SET last_used_at = ? WHERE user_id = ?')->execute([tj_now(), $u['id']]);
    return $u;
}

/* ---- JSON-RPC ---- */

function tj_mcp_reply($id, array $result): void {
    tj_json(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]);
}

function tj_mcp_error($id, int $code, string $message, int $status = 200): void {
    tj_json(['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]], $status);
}

function tj_mcp_handle(?string $key = null): void {
    // No server-to-client stream: GET (and DELETE of a session) are 405 per spec.
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        header('Allow: POST');
        tj_json(['error' => 'method_not_allowed'], 405);
    }
    $msg = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($msg) || ($msg['jsonrpc'] ?? null) !== '2.0') tj_mcp_error(null, -32700, 'Parse error', 400);

    $user = tj_mcp_user($key);
    if (!$user) {
        tj_throttle('mcp_bad', tj_client_ip(), 30, 600); // guessing keys
        tj_mcp_error($msg['id'] ?? null, -32001, 'This Toojibee link is not valid (any more). Make a new one in the Toojibee app: Profile → Connect to AI.', 401);
    }
    tj_throttle('mcp', (string)$user['id'], 120, 60);

    $rpc = is_string($msg['method'] ?? null) ? $msg['method'] : '';
    // Notifications and client responses carry no id: 202, no body.
    if (!array_key_exists('id', $msg) || $rpc === '') {
        http_response_code(202);
        exit;
    }
    $id = $msg['id'];
    $params = is_array($msg['params'] ?? null) ? $msg['params'] : [];

    switch ($rpc) {
        case 'initialize':
            $asked = (string)($params['protocolVersion'] ?? '');
            tj_mcp_reply($id, [
                'protocolVersion' => in_array($asked, TJ_MCP_VERSIONS, true) ? $asked : TJ_MCP_VERSIONS[1],
                'capabilities'    => ['tools' => ['listChanged' => false]],
                'serverInfo'      => ['name' => 'toojibee', 'title' => 'Toojibee', 'version' => '1.0.0'],
                'instructions'    => "Toojibee is this person's planner: tasks (one-off or repeating, up to 3 subtasks), habits (ticked per day) and events. "
                    . 'Start with get_day (today by default) or list_items; every change needs an id from them. '
                    . 'Dates are Gregorian YYYY-MM-DD and times HH:MM, in Iran time; the reply of get_day also gives the Jalali (Persian) date. '
                    . 'Weekdays are numbers, 0 = Sunday … 6 = Saturday. Write titles in the language the person uses.',
            ]);
        case 'ping':
            tj_mcp_reply($id, []);
        case 'tools/list':
            tj_mcp_reply($id, ['tools' => tj_mcp_tools()]);
        case 'tools/call':
            $name = (string)($params['name'] ?? '');
            $args = is_array($params['arguments'] ?? null) ? $params['arguments'] : [];
            if (!in_array($name, array_column(tj_mcp_tools(), 'name'), true)) tj_mcp_error($id, -32602, 'Unknown tool: ' . $name);
            try {
                $out = tj_mcp_call((int)$user['id'], $name, $args);
                tj_mcp_reply($id, ['content' => [['type' => 'text', 'text' => json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]], 'isError' => false]);
            } catch (TjMcpToolError $e) {
                tj_mcp_reply($id, ['content' => [['type' => 'text', 'text' => $e->getMessage()]], 'isError' => true]);
            }
        default:
            tj_mcp_error($id, -32601, 'Method not found');
    }
}

/* ---- tool definitions ---- */

function tj_mcp_tools(): array {
    $date = fn(string $d) => ['type' => 'string', 'pattern' => '^\d{4}-\d{2}-\d{2}$', 'description' => $d];
    $time = fn(string $d) => ['type' => 'string', 'pattern' => '^\d{2}:\d{2}$', 'description' => $d];
    $repeat = [
        'type' => 'object',
        'description' => 'How it repeats. Leave out for no repeat (habits: every day).',
        'properties' => [
            'type'     => ['type' => 'string', 'enum' => ['none', 'daily', 'every_n_days', 'weekdays', 'monthly', 'yearly']],
            'every'    => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30, 'description' => 'every_n_days (up to 30) / monthly (up to 12) / yearly (up to 10): the step.'],
            'weekdays' => ['type' => 'array', 'items' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 6], 'description' => 'weekdays: 0 = Sunday … 6 = Saturday.'],
            'calendar' => ['type' => 'string', 'enum' => ['jalali', 'gregorian', 'hijri'], 'description' => 'monthly / yearly: the calendar whose day of the month is kept (default jalali).'],
        ],
        'required' => ['type'],
    ];
    $reminder = $time('Reminder time on the day (HH:MM). Empty string removes the reminder.');
    $id = ['type' => 'string', 'description' => 'The id from get_day or list_items (a subtask id works for set_status and delete_item).'];
    $ro = ['readOnlyHint' => true, 'openWorldHint' => false];
    $rw = ['readOnlyHint' => false, 'destructiveHint' => false, 'openWorldHint' => false];
    return [
        ['name' => 'get_day', 'title' => 'What is on a day',
         'description' => "The person's tasks, habits and events on a day, with what is done. Also the day's Jalali date and weekday.",
         'inputSchema' => ['type' => 'object', 'properties' => ['date' => $date('The day; default today (Iran time).')]],
         'annotations' => $ro],
        ['name' => 'list_items', 'title' => 'List tasks, habits and events',
         'description' => 'Every item of a kind, or the ones that happen between two dates, or whose title or text contains a word.',
         'inputSchema' => ['type' => 'object', 'properties' => [
             'kind'  => ['type' => 'string', 'enum' => ['all', 'task', 'habit', 'event'], 'description' => 'Default all.'],
             'from'  => $date('Only items that happen on or after this day (with "to", at most 366 days).'),
             'to'    => $date('Only items that happen on or before this day.'),
             'query' => ['type' => 'string', 'description' => 'Only items whose title, category or description contains this.'],
         ]],
         'annotations' => $ro],
        ['name' => 'add_task', 'title' => 'Add a task',
         'description' => 'Adds a task. Without a date it goes on today.',
         'inputSchema' => ['type' => 'object', 'properties' => [
             'title' => ['type' => 'string'], 'date' => $date('Its day (or first day). Default today.'),
             'end_date' => $date('Last day, for a task that spans several days.'),
             'start_time' => $time('Start time.'), 'end_time' => $time('End time.'),
             'description' => ['type' => 'string'], 'category' => ['type' => 'string'],
             'subtasks' => ['type' => 'array', 'items' => ['type' => 'string'], 'maxItems' => 3, 'description' => 'Up to 3 subtask titles.'],
             'pinned' => ['type' => 'boolean'], 'repeat' => $repeat, 'reminder_time' => $reminder,
         ], 'required' => ['title']],
         'annotations' => $rw],
        ['name' => 'add_habit', 'title' => 'Add a habit',
         'description' => 'Adds a habit, ticked day by day (every day unless repeat says otherwise).',
         'inputSchema' => ['type' => 'object', 'properties' => [
             'title' => ['type' => 'string'], 'start_date' => $date('First day. Default today.'),
             'repeat' => $repeat, 'reminder_time' => $reminder,
         ], 'required' => ['title']],
         'annotations' => $rw],
        ['name' => 'add_event', 'title' => 'Add an event',
         'description' => 'Adds an event (a class, a trip, an appointment…).',
         'inputSchema' => ['type' => 'object', 'properties' => [
             'title' => ['type' => 'string'], 'date' => $date('Its day (or first day).'),
             'end_date' => $date('Last day, for an event over several days.'),
             'start_time' => $time('Start time.'), 'end_time' => $time('End time.'),
             'description' => ['type' => 'string'], 'repeat' => $repeat, 'reminder_time' => $reminder,
         ], 'required' => ['title', 'date']],
         'annotations' => $rw],
        ['name' => 'update_item', 'title' => 'Change a task, habit or event',
         'description' => 'Changes only the fields given. For a habit, "date" is its first day. An empty string clears end_date, the times, description, category or reminder_time.',
         'inputSchema' => ['type' => 'object', 'properties' => [
             'id' => $id, 'title' => ['type' => 'string'], 'date' => $date('New day (first day).'),
             'end_date' => $date('New last day.'), 'start_time' => $time('New start time.'), 'end_time' => $time('New end time.'),
             'description' => ['type' => 'string'], 'category' => ['type' => 'string'], 'pinned' => ['type' => 'boolean'],
             'repeat' => $repeat, 'reminder_time' => $reminder,
         ], 'required' => ['id']],
         'annotations' => $rw],
        ['name' => 'set_status', 'title' => 'Mark done or not done',
         'description' => 'Marks a task, subtask or habit as done or not done, or clears the mark. Repeating tasks and habits are marked per day.',
         'inputSchema' => ['type' => 'object', 'properties' => [
             'id' => $id, 'status' => ['type' => 'string', 'enum' => ['done', 'not_done', 'none']],
             'date' => $date('The day, for a habit or a repeating task. Default today.'),
         ], 'required' => ['id', 'status']],
         'annotations' => ['readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false]],
        ['name' => 'delete_item', 'title' => 'Delete a task, habit or event',
         'description' => 'Deletes it for good (a habit with its whole history). Ask the person first.',
         'inputSchema' => ['type' => 'object', 'properties' => ['id' => $id], 'required' => ['id']],
         'annotations' => ['readOnlyHint' => false, 'destructiveHint' => true, 'openWorldHint' => false]],
    ];
}

/* ---- the document ---- */

/* Decoded as objects, not arrays: an empty {} (statusByDate, progress)
 * must stay {} — as [] the app's later writes to it would be lost. */
function tj_mcp_decode(?string $json): stdClass {
    $d = $json === null ? null : json_decode($json);
    if (!($d instanceof stdClass)) $d = new stdClass();
    foreach (TJ_MCP_LISTS as $list) if (!isset($d->$list) || !is_array($d->$list)) $d->$list = [];
    return $d;
}

function tj_mcp_doc(int $userId): stdClass {
    $q = tj_db()->prepare('SELECT data FROM tj_user_data WHERE user_id = ?');
    $q->execute([$userId]);
    $row = $q->fetch();
    return tj_mcp_decode($row ? $row['data'] : null);
}

/* Runs $change on the document and saves it as the next version, all in
 * one write transaction (like PUT /sync). Returns what $change returns. */
function tj_mcp_change(int $userId, callable $change) {
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $q = $db->prepare('SELECT data, version FROM tj_user_data WHERE user_id = ?' . (tj_driver() === 'mysql' ? ' FOR UPDATE' : ''));
        $q->execute([$userId]);
        $row = $q->fetch();
        $doc = tj_mcp_decode($row ? $row['data'] : null);
        $out = $change($doc);
        $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (strlen($json) > TJ_MAX_SYNC_BYTES) throw new TjMcpToolError('The planner is full (too much data). Delete some old items first.');
        if ($row) {
            $db->prepare('UPDATE tj_user_data SET data = ?, version = ?, updated_at = ? WHERE user_id = ?')->execute([$json, (int)$row['version'] + 1, tj_now(), $userId]);
        } else {
            $db->prepare('INSERT INTO tj_user_data (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)')->execute([$userId, $json, 1, tj_now()]);
        }
        tj_tx_commit($db);
        return $out;
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        throw $e;
    }
}

/* [kind, item, parent task or null] for an id, or a tool error. */
function tj_mcp_find(stdClass $doc, string $id): array {
    foreach (TJ_MCP_LISTS as $kind => $list) {
        foreach ($doc->$list as $it) {
            if (!($it instanceof stdClass)) continue;
            if (($it->id ?? null) === $id) return [$kind, $it, null];
            if ($kind === 'task') foreach ((array)($it->subtasks ?? []) as $s) {
                if ($s instanceof stdClass && ($s->id ?? null) === $id) return ['subtask', $s, $it];
            }
        }
    }
    throw new TjMcpToolError("No task, habit or event has the id $id. Use get_day or list_items for the ids.");
}

/* ---- dates ---- */

function tj_mcp_today(): string {
    return (new DateTime('now', new DateTimeZone(TJ_MCP_TZ)))->format('Y-m-d');
}

function tj_mcp_ymd(string $d): array {
    return array_map('intval', explode('-', $d));
}

function tj_mcp_jdn(string $d): int {
    [$y, $m, $dd] = tj_mcp_ymd($d);
    return tj_g2jdn($y, $m, $dd);
}

function tj_mcp_from_jdn(int $jdn): string {
    [$y, $m, $d] = tj_jdn2g($jdn);
    return sprintf('%04d-%02d-%02d', $y, $m, $d);
}

/* 0 = Sunday … 6 = Saturday, like the app's Date.getDay(). */
function tj_mcp_weekday(string $d): int {
    return (tj_mcp_jdn($d) + 1) % 7;
}

function tj_mcp_parts(string $d, string $cal): array {
    [$y, $m, $dd] = tj_mcp_ymd($d);
    if ($cal === 'gregorian') return [$y, $m, $dd];
    if ($cal === 'hijri') return array_map('intval', tj_hijri($y, $m, $dd)); // table rows can be strings
    return tj_jalali($y, $m, $dd);
}

/* Same rule as monthlyRepeatMatches() in frontend/demo/js/core/state.js. */
function tj_mcp_monthly(stdClass $rec, string $start, string $d): bool {
    $cal = in_array($rec->cal ?? '', ['gregorian', 'hijri'], true) ? $rec->cal : 'jalali';
    $a = tj_mcp_parts(is_string($rec->anchor ?? null) ? $rec->anchor : $start, $cal);
    $p = tj_mcp_parts($d, $cal);
    $last = tj_mcp_parts(tj_mcp_from_jdn(tj_mcp_jdn($d) + 1), $cal)[1] !== $p[1];
    if (!($p[2] === $a[2] || ($a[2] > $p[2] && $last))) return false;
    $n = max(1, (int)($rec->interval ?? 1));
    if (($rec->mode ?? null) === 'monthly') { $diff = ($p[0] - $a[0]) * 12 + ($p[1] - $a[1]); return $diff >= 0 && $diff % $n === 0; }
    if ($p[1] !== $a[1]) return false;
    $diff = $p[0] - $a[0];
    return $diff >= 0 && $diff % $n === 0;
}

/* Same as occursOnDate() / habitOccursOnDate() in state.js. */
function tj_mcp_occurs(stdClass $it, string $kind, string $d): bool {
    $rec = ($it->recurrence ?? null) instanceof stdClass ? $it->recurrence : (object)['mode' => null];
    $mode = $rec->mode ?? null;
    $wd = array_map('intval', (array)($rec->weekdays ?? []));
    if ($kind === 'habit') {
        $start = (string)($it->startDate ?? '');
        if ($start === '' || $d < $start) return false;
        if ($mode === 'weekdays') return $wd ? in_array(tj_mcp_weekday($d), $wd, true) : $d === $start;
        if ($mode === 'monthly' || $mode === 'yearly') return tj_mcp_monthly($rec, $start, $d);
        return (tj_mcp_jdn($d) - tj_mcp_jdn($start)) % max(1, (int)($rec->interval ?? 1)) === 0;
    }
    $date = (string)($it->date ?? '');
    if ($date === '') return false;
    if (($it->timeMode ?? '') === 'range' && !$mode) return $d >= $date && $d <= (string)($it->endDate ?? $date);
    if ($mode === 'interval') { $diff = tj_mcp_jdn($d) - tj_mcp_jdn($date); return $diff >= 0 && $diff % max(1, (int)($rec->interval ?? 1)) === 0; }
    if ($mode === 'weekdays') return $wd ? ($d >= $date && in_array(tj_mcp_weekday($d), $wd, true)) : $d === $date;
    if ($mode === 'monthly' || $mode === 'yearly') return $d >= $date && tj_mcp_monthly($rec, $date, $d);
    return $d === $date;
}

/* ---- what the tools show ---- */

function tj_mcp_status(stdClass $it, string $kind, ?string $day): ?string {
    if ($kind === 'habit') {
        if ($day === null) return null;
        if (in_array($day, (array)($it->completedDates ?? []), true)) return 'done';
        return in_array($day, (array)($it->skippedDates ?? []), true) ? 'not_done' : null;
    }
    if ($kind === 'event') return null;
    if ($kind === 'task' && !empty($it->recurrence->mode ?? null)) {
        if ($day === null) return null;
        $s = ((array)($it->statusByDate ?? []))[$day] ?? null;
        return in_array($s, ['done', 'not_done'], true) ? $s : null;
    }
    return !empty($it->done) ? 'done' : (!empty($it->skipped) ? 'not_done' : null);
}

function tj_mcp_repeat_out($rec): ?array {
    if (!($rec instanceof stdClass) || empty($rec->mode)) return null;
    $n = max(1, (int)($rec->interval ?? 1));
    switch ($rec->mode) {
        case 'interval': return $n === 1 ? ['type' => 'daily'] : ['type' => 'every_n_days', 'every' => $n];
        case 'weekdays': return ['type' => 'weekdays', 'weekdays' => array_map('intval', (array)($rec->weekdays ?? []))];
        case 'monthly': case 'yearly': return ['type' => $rec->mode, 'every' => $n, 'calendar' => $rec->cal ?? 'jalali'];
    }
    return null;
}

function tj_mcp_out(stdClass $it, string $kind, ?string $day = null): array {
    $o = ['id' => $it->id ?? '', 'kind' => $kind, 'title' => (string)($it->title ?? '')];
    if ($kind === 'habit') {
        $o['start_date'] = $it->startDate ?? null;
        $o['repeat'] = tj_mcp_repeat_out($it->recurrence ?? null) ?? ['type' => 'daily'];
        if (!empty($it->tracker->kind ?? null)) $o['tracker'] = $it->tracker->kind; // counter / timer: ticked in the app
    } else {
        $o['date'] = $it->date ?? null;
        if (($it->timeMode ?? '') === 'range' && !empty($it->endDate)) $o['end_date'] = $it->endDate;
        if (!empty($it->startTime)) $o['start_time'] = $it->startTime;
        if (!empty($it->endTime)) $o['end_time'] = $it->endTime;
        $o['repeat'] = tj_mcp_repeat_out($it->recurrence ?? null);
        if (trim((string)($it->description ?? '')) !== '') $o['description'] = $it->description;
    }
    if ($kind === 'task') {
        if (trim((string)($it->category ?? '')) !== '') $o['category'] = $it->category;
        if (!empty($it->pinned)) $o['pinned'] = true;
        $subs = [];
        foreach ((array)($it->subtasks ?? []) as $s) if ($s instanceof stdClass) {
            $subs[] = ['id' => $s->id ?? '', 'title' => (string)($s->title ?? $s->text ?? ''), 'status' => !empty($s->done) ? 'done' : (!empty($s->skipped) ? 'not_done' : null)];
        }
        if ($subs) $o['subtasks'] = $subs;
    }
    if (($it->notification->type ?? null) === 'time' && !empty($it->notification->time)) $o['reminder_time'] = $it->notification->time;
    if ($kind !== 'event' && ($day !== null || $kind === 'task')) $o['status'] = tj_mcp_status($it, $kind, $day);
    return $o;
}

/* ---- reading the tools' arguments ---- */

function tj_mcp_text(array $a, string $k, int $max, bool $required = false): ?string {
    if (!array_key_exists($k, $a) || $a[$k] === null) {
        if ($required) throw new TjMcpToolError("\"$k\" is required.");
        return null;
    }
    if (!is_string($a[$k])) throw new TjMcpToolError("\"$k\" must be text.");
    $v = trim($a[$k]);
    if ($required && $v === '') throw new TjMcpToolError("\"$k\" can't be empty.");
    if (mb_strlen($v) > $max) throw new TjMcpToolError("\"$k\" is too long (at most $max characters).");
    return $v;
}

/* null = not given, '' = clear, else a valid YYYY-MM-DD. */
function tj_mcp_date_arg(array $a, string $k): ?string {
    $v = tj_mcp_text($a, $k, 10);
    if ($v === null || $v === '') return $v;
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) throw new TjMcpToolError("\"$k\" must be a date like 2026-10-26.");
    return $v;
}

function tj_mcp_time_arg(array $a, string $k): ?string {
    $v = tj_mcp_text($a, $k, 5);
    if ($v === null || $v === '') return $v;
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) throw new TjMcpToolError("\"$k\" must be a time like 18:30.");
    return $v;
}

function tj_mcp_bool_arg(array $a, string $k): ?bool {
    if (!array_key_exists($k, $a) || $a[$k] === null) return null;
    if (!is_bool($a[$k])) throw new TjMcpToolError("\"$k\" must be true or false.");
    return $a[$k];
}

/* The app's recurrence object from a "repeat" argument. */
function tj_mcp_recurrence($r, string $kind): stdClass {
    $none = (object)['mode' => $kind === 'habit' ? 'interval' : null, 'interval' => 1, 'weekdays' => []];
    if ($r === null) return $none;
    if (!is_array($r)) throw new TjMcpToolError('"repeat" must be an object like {"type": "weekdays", "weekdays": [6, 1]}.');
    $type = $r['type'] ?? 'none';
    $every = $r['every'] ?? 1;
    // The app's limits: every N days up to 30, months up to 12, years up to 10.
    $max = ['monthly' => 12, 'yearly' => 10][$type] ?? 30;
    if (!is_int($every) || $every < 1 || $every > $max) throw new TjMcpToolError("\"repeat.every\" must be a whole number from 1 to $max.");
    switch ($type) {
        case 'none': return $none;
        case 'daily': return (object)['mode' => 'interval', 'interval' => 1, 'weekdays' => []];
        case 'every_n_days': return (object)['mode' => 'interval', 'interval' => $every, 'weekdays' => []];
        case 'weekdays':
            $wd = $r['weekdays'] ?? null;
            if (!is_array($wd) || !$wd) throw new TjMcpToolError('"repeat.weekdays" needs at least one day (0 = Sunday … 6 = Saturday).');
            foreach ($wd as $x) if (!is_int($x) || $x < 0 || $x > 6) throw new TjMcpToolError('"repeat.weekdays" are numbers from 0 (Sunday) to 6 (Saturday).');
            $wd = array_values(array_unique($wd));
            sort($wd);
            return (object)['mode' => 'weekdays', 'interval' => 1, 'weekdays' => $wd];
        case 'monthly': case 'yearly':
            $cal = $r['calendar'] ?? 'jalali';
            if (!in_array($cal, ['jalali', 'gregorian', 'hijri'], true)) throw new TjMcpToolError('"repeat.calendar" is jalali, gregorian or hijri.');
            return (object)['mode' => $type, 'interval' => $every, 'weekdays' => [], 'cal' => $cal];
    }
    throw new TjMcpToolError('"repeat.type" is none, daily, every_n_days, weekdays, monthly or yearly.');
}

function tj_mcp_notification(?string $time): stdClass {
    return $time ? (object)['type' => 'time', 'time' => $time, 'repeatHours' => 1, 'text' => ''] : (object)['type' => null];
}

function tj_mcp_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
}

/* Start/end day of a task or event: [date, endDate|null, timeMode]. */
function tj_mcp_span(string $date, ?string $end): array {
    if ($end !== null && $end !== '' && $end < $date) throw new TjMcpToolError('"end_date" is before the first day.');
    return ($end !== null && $end !== '' && $end !== $date) ? [$date, $end, 'range'] : [$date, null, 'single'];
}

function tj_mcp_times(array $a): array {
    $s = tj_mcp_time_arg($a, 'start_time');
    $e = tj_mcp_time_arg($a, 'end_time');
    if ($s && $e && $e < $s) throw new TjMcpToolError('"end_time" is before "start_time".');
    return [$s ?: null, $e ?: null];
}

/* ---- the tools ---- */

function tj_mcp_call(int $userId, string $name, array $a): array {
    switch ($name) {
        case 'get_day': {
            $day = tj_mcp_date_arg($a, 'date') ?: tj_mcp_today();
            $doc = tj_mcp_doc($userId);
            [$y, $m, $d] = tj_mcp_ymd($day);
            [$jy, $jm, $jd] = tj_jalali($y, $m, $d);
            $out = ['date' => $day, 'jalali' => sprintf('%d %s %d', $jd, TJ_JALALI_MONTHS_EN[$jm - 1], $jy),
                    'weekday' => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][tj_mcp_weekday($day)],
                    'today' => tj_mcp_today()];
            foreach (TJ_MCP_LISTS as $kind => $list) {
                $out[$list] = [];
                foreach ($doc->$list as $it) if ($it instanceof stdClass && tj_mcp_occurs($it, $kind, $day)) $out[$list][] = tj_mcp_out($it, $kind, $day);
            }
            return $out;
        }
        case 'list_items': {
            $kind = $a['kind'] ?? 'all';
            if (!in_array($kind, ['all', 'task', 'habit', 'event'], true)) throw new TjMcpToolError('"kind" is all, task, habit or event.');
            $from = tj_mcp_date_arg($a, 'from') ?: null;
            $to = tj_mcp_date_arg($a, 'to') ?: null;
            if ($from && !$to) $to = $from;
            if ($to && !$from) $from = $to;
            if ($from && ($to < $from || tj_mcp_jdn($to) - tj_mcp_jdn($from) > 365)) throw new TjMcpToolError('"from"…"to" must be in order and at most 366 days.');
            $q = mb_strtolower((string)tj_mcp_text($a, 'query', 100));
            $doc = tj_mcp_doc($userId);
            $out = [];
            foreach (TJ_MCP_LISTS as $k => $list) {
                if ($kind !== 'all' && $kind !== $k) continue;
                foreach ($doc->$list as $it) {
                    if (!($it instanceof stdClass)) continue;
                    if ($q !== '' && mb_strpos(mb_strtolower(($it->title ?? '') . ' ' . ($it->category ?? '') . ' ' . ($it->description ?? '')), $q) === false) continue;
                    if ($from) {
                        $hit = false;
                        for ($j = tj_mcp_jdn($from), $end = tj_mcp_jdn($to); $j <= $end && !$hit; $j++) $hit = tj_mcp_occurs($it, $k, tj_mcp_from_jdn($j));
                        if (!$hit) continue;
                    }
                    $out[] = tj_mcp_out($it, $k);
                }
            }
            return ['count' => count($out), 'items' => array_slice($out, 0, 200)];
        }
        case 'add_task': case 'add_event': {
            $kind = $name === 'add_task' ? 'task' : 'event';
            $title = tj_mcp_text($a, 'title', 200, true);
            $date = tj_mcp_date_arg($a, 'date');
            if ($kind === 'event' && !$date) throw new TjMcpToolError('"date" is required for an event.');
            [$date, $end, $mode] = tj_mcp_span($date ?: tj_mcp_today(), tj_mcp_date_arg($a, 'end_date'));
            [$st, $et] = tj_mcp_times($a);
            $it = (object)['id' => tj_mcp_uuid(), 'title' => $title];
            if ($kind === 'task') {
                $subs = $a['subtasks'] ?? [];
                if (!is_array($subs) || count($subs) > 3) throw new TjMcpToolError('"subtasks" is a list of at most 3 titles.');
                $it->category = (string)tj_mcp_text($a, 'category', 60);
            }
            $it->description = (string)tj_mcp_text($a, 'description', 2000);
            if ($kind === 'task') {
                $it->photos = []; $it->pinned = (bool)tj_mcp_bool_arg($a, 'pinned'); $it->done = false; $it->skipped = false;
                $it->statusByDate = new stdClass();
                $it->subtasks = [];
                foreach ($subs as $s) {
                    if (!is_string($s) || trim($s) === '' || mb_strlen($s) > 200) throw new TjMcpToolError('Each subtask is a title of 1 to 200 characters.');
                    $it->subtasks[] = (object)['id' => tj_mcp_uuid(), 'title' => trim($s), 'text' => trim($s), 'done' => false, 'skipped' => false,
                        'description' => '', 'photos' => [], 'timeMode' => 'single', 'date' => $date, 'endDate' => null, 'notification' => (object)['type' => null]];
                }
            }
            $it->timeMode = $mode; $it->date = $date; $it->endDate = $end; $it->startTime = $st; $it->endTime = $et;
            $it->recurrence = tj_mcp_recurrence($a['repeat'] ?? null, $kind);
            $it->notification = tj_mcp_notification(tj_mcp_time_arg($a, 'reminder_time'));
            tj_mcp_change($userId, function (stdClass $doc) use ($it, $kind) { $doc->{TJ_MCP_LISTS[$kind]}[] = $it; });
            return ['added' => tj_mcp_out($it, $kind)];
        }
        case 'add_habit': {
            $it = (object)['id' => tj_mcp_uuid(), 'title' => tj_mcp_text($a, 'title', 200, true),
                'recurrence' => tj_mcp_recurrence($a['repeat'] ?? null, 'habit'),
                'notification' => tj_mcp_notification(tj_mcp_time_arg($a, 'reminder_time')),
                'startDate' => tj_mcp_date_arg($a, 'start_date') ?: tj_mcp_today(),
                'completedDates' => [], 'skippedDates' => [], 'tracker' => null, 'progress' => new stdClass()];
            tj_mcp_change($userId, function (stdClass $doc) use ($it) { $doc->habits[] = $it; });
            return ['added' => tj_mcp_out($it, 'habit')];
        }
        case 'update_item': {
            $id = tj_mcp_text($a, 'id', 64, true);
            return tj_mcp_change($userId, function (stdClass $doc) use ($id, $a) {
                [$kind, $it] = tj_mcp_find($doc, $id);
                if ($kind === 'subtask') throw new TjMcpToolError('Subtasks can only be marked (set_status) or deleted here; change their parent task in the app.');
                if (($t = tj_mcp_text($a, 'title', 200)) !== null) { if ($t === '') throw new TjMcpToolError('"title" can\'t be empty.'); $it->title = $t; }
                if ($kind !== 'habit' && ($v = tj_mcp_text($a, 'description', 2000)) !== null) $it->description = $v;
                if ($kind === 'task' && ($v = tj_mcp_text($a, 'category', 60)) !== null) $it->category = $v;
                if ($kind === 'task' && ($v = tj_mcp_bool_arg($a, 'pinned')) !== null) $it->pinned = $v;
                $date = tj_mcp_date_arg($a, 'date');
                if ($kind === 'habit') {
                    if ($date) $it->startDate = $date;
                } else {
                    $end = tj_mcp_date_arg($a, 'end_date');
                    if ($date || $end !== null) {
                        [$it->date, $it->endDate, $it->timeMode] = tj_mcp_span($date ?: (string)($it->date ?? tj_mcp_today()), $end !== null ? $end : ($it->endDate ?? null));
                    }
                    $s = tj_mcp_time_arg($a, 'start_time');
                    $e = tj_mcp_time_arg($a, 'end_time');
                    if ($s !== null) $it->startTime = $s ?: null;
                    if ($e !== null) $it->endTime = $e ?: null;
                    if (!empty($it->startTime) && !empty($it->endTime) && $it->endTime < $it->startTime) throw new TjMcpToolError('"end_time" is before "start_time".');
                }
                if (array_key_exists('repeat', $a)) $it->recurrence = tj_mcp_recurrence($a['repeat'], $kind);
                if (($r = tj_mcp_time_arg($a, 'reminder_time')) !== null) {
                    $n = tj_mcp_notification($r ?: null);
                    // Keep the reminder's own settings (repeat, text) when only its time changes.
                    if ($r && ($it->notification->type ?? null) === 'time') $it->notification->time = $r; else $it->notification = $n;
                }
                return ['updated' => tj_mcp_out($it, $kind)];
            });
        }
        case 'set_status': {
            $id = tj_mcp_text($a, 'id', 64, true);
            $status = $a['status'] ?? null;
            if (!in_array($status, ['done', 'not_done', 'none'], true)) throw new TjMcpToolError('"status" is done, not_done or none.');
            $day = tj_mcp_date_arg($a, 'date') ?: tj_mcp_today();
            return tj_mcp_change($userId, function (stdClass $doc) use ($id, $status, $day) {
                [$kind, $it, $parent] = tj_mcp_find($doc, $id);
                if ($kind === 'event') throw new TjMcpToolError('Events have no done / not done.');
                if ($kind === 'habit') {
                    if (!tj_mcp_occurs($it, 'habit', $day)) throw new TjMcpToolError("This habit isn't on $day.");
                    $it->completedDates = array_values(array_filter((array)($it->completedDates ?? []), fn($x) => $x !== $day));
                    $it->skippedDates = array_values(array_filter((array)($it->skippedDates ?? []), fn($x) => $x !== $day));
                    if ($status === 'done') $it->completedDates[] = $day;
                    if ($status === 'not_done') $it->skippedDates[] = $day;
                    return ['updated' => tj_mcp_out($it, 'habit', $day)];
                }
                if ($kind === 'subtask') {
                    $it->done = $status === 'done';
                    $it->skipped = $status === 'not_done';
                    if (empty($parent->recurrence->mode ?? null)) {
                        $all = true;
                        foreach ((array)$parent->subtasks as $s) $all = $all && !empty($s->done);
                        $parent->done = $all;
                        if ($all) $parent->skipped = false;
                    }
                    return ['updated' => tj_mcp_out($parent, 'task')];
                }
                if (!empty($it->recurrence->mode ?? null)) {
                    if (!tj_mcp_occurs($it, 'task', $day)) throw new TjMcpToolError("This repeating task isn't on $day.");
                    $map = (object)(array)($it->statusByDate ?? []); // [] from an older save is {} here
                    if ($status === 'none') unset($map->$day); else $map->$day = $status;
                    $it->statusByDate = $map;
                    return ['updated' => tj_mcp_out($it, 'task', $day)];
                }
                $it->done = $status === 'done';
                $it->skipped = $status === 'not_done';
                foreach ((array)($it->subtasks ?? []) as $s) if ($s instanceof stdClass) { $s->done = $it->done; $s->skipped = $it->skipped; }
                return ['updated' => tj_mcp_out($it, 'task')];
            });
        }
        case 'delete_item': {
            $id = tj_mcp_text($a, 'id', 64, true);
            return tj_mcp_change($userId, function (stdClass $doc) use ($id) {
                [$kind, $it, $parent] = tj_mcp_find($doc, $id);
                $title = (string)($it->title ?? $it->text ?? '');
                if ($kind === 'subtask') {
                    $parent->subtasks = array_values(array_filter((array)$parent->subtasks, fn($s) => ($s->id ?? null) !== $id));
                    if ($parent->subtasks && empty($parent->recurrence->mode ?? null)) {
                        $all = true;
                        foreach ($parent->subtasks as $s) $all = $all && !empty($s->done);
                        $parent->done = $all;
                    }
                } else {
                    $list = TJ_MCP_LISTS[$kind];
                    $doc->$list = array_values(array_filter($doc->$list, fn($x) => !($x instanceof stdClass) || ($x->id ?? null) !== $id));
                }
                return ['deleted' => ['id' => $id, 'kind' => $kind, 'title' => $title]];
            });
        }
    }
    throw new TjMcpToolError('Unknown tool.');
}
