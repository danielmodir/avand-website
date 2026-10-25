<?php
/* /api/v1/mcp — MCP server (Streamable HTTP transport) for Claude
 * connectors. Behind the v1 router, like every other endpoint, so the
 * .htaccess in /api needs no change.
 *
 * Step 1 of the per-user MCP plan: a reachability probe with no sign-in
 * and no user data. It answers initialize / tools/list / tools/call with
 * one harmless tool, so a Claude connector can prove that Anthropic's
 * servers (outside Iran) reach this host. Each request's time, IP, user
 * agent and JSON-RPC method go to ~/toojibee-data/mcp-probe.log; GET shows
 * the last few (no IPs). OAuth and the real tools replace this in step 2.
 */
declare(strict_types=1);

const TJ_MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const TJ_MCP_LOG_MAX = 200 * 1024;

function tj_mcp_log_path(): string {
    return tj_data_dir() . '/mcp-probe.log';
}

function tj_mcp_log(string $rpc): void {
    $path = tj_mcp_log_path();
    if (is_file($path) && filesize($path) > TJ_MCP_LOG_MAX) @unlink($path);
    $line = json_encode([
        'at'  => gmdate('c'),
        'ip'  => tj_client_ip(),
        'ua'  => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
        'm'   => $_SERVER['REQUEST_METHOD'] ?? '',
        'rpc' => $rpc,
    ], JSON_UNESCAPED_SLASHES) . "\n";
    @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
}

function tj_mcp_recent(int $n): array {
    $path = tj_mcp_log_path();
    if (!is_file($path)) return [];
    $lines = array_slice(file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [], -$n);
    $out = [];
    foreach ($lines as $l) {
        $r = json_decode($l, true);
        if (is_array($r)) $out[] = ['at' => $r['at'] ?? '', 'ua' => $r['ua'] ?? '', 'rpc' => $r['rpc'] ?? ''];
    }
    return $out;
}

function tj_mcp_reply($id, array $result): void {
    tj_json(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]);
}

function tj_mcp_error($id, int $code, string $message, int $status = 200): void {
    tj_json(['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]], $status);
}

function tj_mcp_handle(): void {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // No server-to-client stream: GET (and DELETE of a session) are 405 per spec.
    if ($method !== 'POST') {
        tj_mcp_log('');
        header('Allow: POST');
        tj_json(['error' => 'method_not_allowed', 'recent' => tj_mcp_recent(15)], 405);
    }

    $msg = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($msg) || ($msg['jsonrpc'] ?? null) !== '2.0') {
        tj_mcp_log('(parse error)');
        tj_mcp_error(null, -32700, 'Parse error', 400);
    }
    $rpc = is_string($msg['method'] ?? null) ? $msg['method'] : '';
    tj_mcp_log($rpc ?: '(response)');

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
                'serverInfo'      => ['name' => 'toojibee', 'title' => 'Toojibee', 'version' => '0.1.0-probe'],
                'instructions'    => 'Toojibee connectivity probe. No user data yet.',
            ]);
        case 'ping':
            tj_mcp_reply($id, []);
        case 'tools/list':
            tj_mcp_reply($id, ['tools' => [[
                'name'        => 'toojibee_ping',
                'title'       => 'Toojibee ping',
                'description' => 'Checks that this Toojibee server is reachable. Returns the server time.',
                'inputSchema' => ['type' => 'object', 'properties' => new stdClass()],
                'annotations' => ['readOnlyHint' => true, 'openWorldHint' => false],
            ]]]);
        case 'tools/call':
            if (($params['name'] ?? '') !== 'toojibee_ping') tj_mcp_error($id, -32602, 'Unknown tool');
            tj_mcp_reply($id, [
                'content' => [['type' => 'text', 'text' => 'Toojibee server reached at ' . gmdate('Y-m-d H:i:s') . ' UTC.']],
                'isError' => false,
            ]);
        default:
            tj_mcp_error($id, -32601, 'Method not found');
    }
}
