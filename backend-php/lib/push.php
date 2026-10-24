<?php
/* Web Push — reminders for a closed app (step 2; step 1 is the app's own
 * js/core/notify.js). The app works out its reminders for the next days
 * itself (the same code that shows them in the browser) and sends the
 * list here; push-cron.php, run every minute by the host's cron, sends
 * each one when it's due. Endpoint names match the Django API.
 *
 *   GET    /notifications/push-key           the server's public VAPID key
 *   POST   /notifications/subscriptions      this browser's push address
 *   DELETE /notifications/subscriptions/<id>
 *   PUT    /notifications/schedule           {items: [...]} — replaces the
 *                                            not-yet-sent reminders
 *
 * Messages are encrypted for the browser (RFC 8291, aes128gcm) and signed
 * with the server's key (RFC 8292, VAPID). Only PHP's own openssl: no
 * library. The key pair is made on first use, outside the web root. */
declare(strict_types=1);

const TJ_PUSH_MAX_ITEMS = 400;
const TJ_PUSH_MAX_SUBS = 10;          // devices per account
const TJ_PUSH_STALE_SECONDS = 1800;   // a reminder more than 30 min late isn't sent
const TJ_PUSH_TTL = 6 * 3600;         // how long the push service keeps it for an offline phone

function tj_b64u(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function tj_b64u_dec(string $s): string {
    $r = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $r === false ? '' : $r;
}

/* P-256 public key (65 raw bytes, 0x04|x|y) as a PEM openssl understands. */
function tj_p256_pem(string $raw): string {
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function tj_p256_raw($key): string {
    $d = openssl_pkey_get_details($key)['ec'];
    return "\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT);
}

function tj_p256_new() {
    $k = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    if ($k === false) throw new RuntimeException('ec_keygen_failed');
    return $k;
}

/* The server's VAPID key pair: {private: PEM, public: base64url raw}. */
function tj_vapid(): array {
    static $v = null;
    if ($v !== null) return $v;
    $path = getenv('TJ_VAPID') ?: tj_home() . '/toojibee-vapid.php';
    if (!is_file($path)) {
        $k = tj_p256_new();
        openssl_pkey_export($k, $pem);
        $data = ['private' => $pem, 'public' => tj_b64u(tj_p256_raw($k))];
        $php = "<?php\n// Web Push (VAPID) key pair, made by the Toojibee API on first use. Never share or commit.\nreturn " . var_export($data, true) . ";\n";
        $tmp = $path . '.' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $php, LOCK_EX) === false) tj_fail(500, 'secrets_unwritable');
        @chmod($tmp, 0600);
        if (!is_file($path)) @rename($tmp, $path); else @unlink($tmp); // two first requests at once: one wins
    }
    $v = require $path;
    return $v;
}

/* ES256 JWT for the push service at $audience (scheme://host). */
function tj_vapid_jwt(string $audience): string {
    $head = tj_b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = tj_b64u(json_encode(['aud' => $audience, 'exp' => time() + 12 * 3600, 'sub' => 'mailto:support@toojibee.ir'], JSON_UNESCAPED_SLASHES));
    $data = "$head.$claims";
    if (!openssl_sign($data, $der, tj_vapid()['private'], OPENSSL_ALGO_SHA256)) throw new RuntimeException('vapid_sign_failed');
    // DER SEQUENCE{INTEGER r, INTEGER s} -> r|s, 32 bytes each.
    $o = 3 + (ord($der[1]) > 0x80 ? ord($der[1]) - 0x80 : 0);
    $rl = ord($der[$o]); $r = substr($der, $o + 1, $rl); $o += 1 + $rl + 1;
    $sl = ord($der[$o]); $s = substr($der, $o + 1, $sl);
    $fix = function (string $n): string { return str_pad(ltrim($n, "\0"), 32, "\0", STR_PAD_LEFT); };
    return $data . '.' . tj_b64u($fix($r) . $fix($s));
}

/* RFC 8291: the body for one message to one browser. */
function tj_push_encrypt(string $payload, string $uaPublic, string $authSecret): string {
    $as = tj_p256_new();
    $asPublic = tj_p256_raw($as);
    $shared = openssl_pkey_derive(openssl_pkey_get_public(tj_p256_pem($uaPublic)), $as, 32);
    if ($shared === false) throw new RuntimeException('ecdh_failed');
    $prkKey = hash_hmac('sha256', $shared, $authSecret, true);
    $ikm = hash_hmac('sha256', "WebPush: info\0" . $uaPublic . $asPublic . "\x01", $prkKey, true);
    $salt = random_bytes(16);
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
    $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
    $tag = '';
    $ct = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($ct === false) throw new RuntimeException('encrypt_failed');
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $ct . $tag;
}

/* One message to one subscription. Returns the HTTP status (0: no answer). */
function tj_push_send(array $sub, array $message): int {
    $url = (string)$sub['endpoint'];
    $p = parse_url($url);
    $body = tj_push_encrypt(json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), tj_b64u_dec($sub['p256dh']), tj_b64u_dec($sub['auth']));
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm',
            'TTL: ' . TJ_PUSH_TTL, 'Urgency: high',
            'Authorization: vapid t=' . tj_vapid_jwt($p['scheme'] . '://' . $p['host']) . ', k=' . tj_vapid()['public'],
        ],
    ]);
    curl_exec($c);
    $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    curl_close($c);
    return $code;
}

/* Only the big browser push services: the server never posts anywhere a
 * client names (no SSRF through a made-up "endpoint"). */
function tj_push_endpoint_ok(string $url): bool {
    $p = parse_url($url);
    if (($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['port'])) return false;
    return (bool)preg_match('/(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/', strtolower($p['host']));
}

/* ---- endpoints ---- */

function tj_push_key(): void {
    tj_json(['public_key' => tj_vapid()['public']]);
}

function tj_push_subscribe(): void {
    $me = tj_require_user();
    $b = tj_body();
    $endpoint = tj_str($b, 'token', 2000);
    $p256dh = tj_str($b, 'web_p256dh', 255);
    $auth = tj_str($b, 'web_auth', 255);
    if (!tj_push_endpoint_ok($endpoint) || strlen(tj_b64u_dec($p256dh)) !== 65 || strlen(tj_b64u_dec($auth)) !== 16) tj_fail(400, 'validation_error');
    tj_throttle('push_sub', (string)$me['id'], 30, 3600);
    $db = tj_db();
    $hash = tj_hash($endpoint);
    tj_tx_begin($db);
    try {
        $q = $db->prepare('SELECT public_id FROM tj_push_subs WHERE endpoint_hash = ?');
        $q->execute([$hash]);
        $pid = $q->fetch()['public_id'] ?? null;
        if ($pid) {
            // Same browser, maybe another account now: it belongs to whoever signed in last.
            $db->prepare('UPDATE tj_push_subs SET user_id = ?, p256dh = ?, auth = ?, fails = 0, updated_at = ? WHERE endpoint_hash = ?')
                ->execute([$me['id'], $p256dh, $auth, tj_now(), $hash]);
        } else {
            $pid = tj_new_public_id();
            $db->prepare('INSERT INTO tj_push_subs (public_id, user_id, endpoint, endpoint_hash, p256dh, auth, fails, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
                ->execute([$pid, $me['id'], $endpoint, $hash, $p256dh, $auth, tj_now(), tj_now()]);
            // Oldest devices beyond the limit go.
            $old = $db->prepare('SELECT id FROM tj_push_subs WHERE user_id = ? ORDER BY updated_at DESC');
            $old->execute([$me['id']]);
            $ids = array_slice(array_column($old->fetchAll(), 'id'), TJ_PUSH_MAX_SUBS);
            foreach ($ids as $id) $db->prepare('DELETE FROM tj_push_subs WHERE id = ?')->execute([$id]);
        }
        tj_tx_commit($db);
    } catch (Throwable $e) { tj_tx_rollback($db); throw $e; }
    tj_json(['id' => $pid], 201);
}

function tj_push_unsubscribe(string $pid): void {
    $me = tj_require_user();
    tj_db()->prepare('DELETE FROM tj_push_subs WHERE public_id = ? AND user_id = ?')->execute([$pid, $me['id']]);
    http_response_code(204);
    exit;
}

/* PUT /notifications/schedule {items: [{slot, at (ms), title, body, kind, id, date}]}
 * Replaces this account's reminders that haven't been sent yet. A slot
 * already sent is never sent again (the app re-sends the same slots). */
function tj_push_schedule(): void {
    $me = tj_require_user();
    $b = tj_body();
    $items = is_array($b['items'] ?? null) ? array_slice($b['items'], 0, TJ_PUSH_MAX_ITEMS) : [];
    tj_throttle('push_sched', (string)$me['id'], 120, 3600);
    $now = time();
    $rows = [];
    foreach ($items as $it) {
        if (!is_array($it)) continue;
        $slot = tj_str($it, 'slot', 200);
        $at = is_numeric($it['at'] ?? null) ? (int)floor($it['at'] / 1000) : 0;
        if ($slot === '' || $at < $now - TJ_PUSH_STALE_SECONDS || $at > $now + 8 * 86400) continue;
        $date = tj_str($it, 'date', 10);
        $rows[$slot] = [$slot, gmdate('Y-m-d H:i:s', $at), tj_str($it, 'title', 160), tj_str($it, 'body', 300),
            json_encode(['kind' => tj_str($it, 'kind', 10), 'id' => tj_str($it, 'id', 64), 'date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : ''])];
    }
    $db = tj_db();
    tj_tx_begin($db);
    try {
        // The team's messages (lib/notices.php) aren't the app's to replace.
        $db->prepare("DELETE FROM tj_push_queue WHERE user_id = ? AND sent_at IS NULL AND slot NOT LIKE 'notice|%'")->execute([$me['id']]);
        $sent = $db->prepare('SELECT slot FROM tj_push_queue WHERE user_id = ?');
        $sent->execute([$me['id']]);
        $done = array_flip(array_column($sent->fetchAll(), 'slot'));
        $ins = $db->prepare('INSERT INTO tj_push_queue (user_id, slot, due_at, title, body, data, sent_at) VALUES (?, ?, ?, ?, ?, ?, NULL)');
        $n = 0;
        foreach ($rows as $slot => $r) {
            if (isset($done[$slot])) continue;
            $ins->execute([$me['id'], $r[0], $r[1], $r[2], $r[3], $r[4]]);
            $n++;
        }
        tj_tx_commit($db);
    } catch (Throwable $e) { tj_tx_rollback($db); throw $e; }
    tj_json(['scheduled' => $n]);
}

/* ---- the sender (push-cron.php, every minute) ---- */

function tj_push_run(): array {
    $db = tj_db();
    $db->prepare('DELETE FROM tj_push_queue WHERE sent_at IS NOT NULL AND sent_at < ?')->execute([tj_now(-3 * 86400)]);
    // Claim what's due (marking it first: a second cron run at the same
    // time can't send it twice), then send outside the lock.
    tj_tx_begin($db);
    try {
        $q = $db->prepare('SELECT * FROM tj_push_queue WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT 300');
        $q->execute([tj_now()]);
        $due = $q->fetchAll();
        if ($due) {
            $mark = $db->prepare('UPDATE tj_push_queue SET sent_at = ? WHERE id = ?');
            foreach ($due as $r) $mark->execute([tj_now(), $r['id']]);
        }
        tj_tx_commit($db);
    } catch (Throwable $e) { tj_tx_rollback($db); throw $e; }

    $stats = ['due' => count($due), 'sent' => 0, 'stale' => 0, 'failed' => 0, 'removed' => 0];
    $subsQ = $db->prepare('SELECT * FROM tj_push_subs WHERE user_id = ?');
    $subsCache = [];
    foreach ($due as $r) {
        if (strtotime($r['due_at'] . ' UTC') < time() - TJ_PUSH_STALE_SECONDS) { $stats['stale']++; continue; }
        $uid = (int)$r['user_id'];
        if (!isset($subsCache[$uid])) { $subsQ->execute([$uid]); $subsCache[$uid] = $subsQ->fetchAll(); }
        $msg = ['title' => $r['title'], 'body' => $r['body'], 'tag' => $r['slot'], 'data' => json_decode((string)$r['data'], true) ?: []];
        foreach ($subsCache[$uid] as $sub) {
            try { $code = tj_push_send($sub, $msg); } catch (Throwable $e) { error_log('[toojibee-push] ' . $e->getMessage()); $code = 0; }
            if ($code >= 200 && $code < 300) {
                $stats['sent']++;
                $db->prepare('UPDATE tj_push_subs SET fails = 0, last_ok_at = ? WHERE id = ?')->execute([tj_now(), $sub['id']]);
            } elseif ($code === 404 || $code === 410) {
                // The browser dropped this subscription: forget it.
                $stats['removed']++;
                $db->prepare('DELETE FROM tj_push_subs WHERE id = ?')->execute([$sub['id']]);
            } else {
                $stats['failed']++;
                $db->prepare('UPDATE tj_push_subs SET fails = fails + 1 WHERE id = ?')->execute([$sub['id']]);
                if ($code !== 0) error_log("[toojibee-push] HTTP $code from " . parse_url((string)$sub['endpoint'], PHP_URL_HOST));
            }
        }
    }
    // A subscription that has failed for days (not "gone", just never
    // answering) is dropped too.
    $db->prepare('DELETE FROM tj_push_subs WHERE fails >= 200')->execute();
    return $stats;
}
