<?php
/* Friends: find someone by username or TJ- code, send a request, accept
 * or decline it, remove a friend, block / unblock. Same paths and shapes
 * as the Django API's social module, so the app's friends page works on
 * either backend. People are addressed by their public_id; the numeric id
 * never leaves the server. What another person sees of you is only your
 * username and TJ- code — never your email or name. */
declare(strict_types=1);

const TJ_SOCIAL_MAX_PENDING = 50; // requests one person can have waiting

function tj_social_card(array $u, string $status): array {
    return [
        'id' => (string)$u['public_id'],
        'name' => $u['username'] ? '@' . $u['username'] : 'TJ-' . $u['display_id'],
        'username' => $u['username'] ?? null,
        'public_id' => (string)$u['display_id'],
        'status' => $status,
    ];
}

/* Another active account by public id, or a 404. */
function tj_social_other(array $me, string $publicId): array {
    if (!preg_match('/^[a-f0-9]{32}$/', $publicId)) tj_fail(404, 'not_found');
    $q = tj_db()->prepare("SELECT * FROM tj_users WHERE public_id = ? AND status = 'active'");
    $q->execute([$publicId]);
    $u = $q->fetch();
    if (!$u || (int)$u['id'] === (int)$me['id']) tj_fail(404, 'not_found');
    return $u;
}

function tj_social_blocked(int $by, int $whom): bool {
    $q = tj_db()->prepare('SELECT 1 FROM tj_blocks WHERE blocker_id = ? AND blocked_id = ?');
    $q->execute([$by, $whom]);
    return (bool)$q->fetch();
}

/* The connection row between two people (either direction), or null. */
function tj_social_row(int $a, int $b): ?array {
    $q = tj_db()->prepare('SELECT * FROM tj_connections WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)');
    $q->execute([$a, $b, $b, $a]);
    return $q->fetch() ?: null;
}

/* How $other looks from $me: none, pending-outgoing, pending-incoming,
 * accepted, blocked (I blocked them). Someone who blocked me is never
 * shown at all (see search). */
function tj_social_status(int $me, int $other): string {
    if (tj_social_blocked($me, $other)) return 'blocked';
    $r = tj_social_row($me, $other);
    if (!$r) return 'none';
    if ($r['status'] === 'accepted') return 'accepted';
    return (int)$r['requester_id'] === $me ? 'pending-outgoing' : 'pending-incoming';
}

/* GET /social/search?q= — an exact TJ- code or an exact username (no
 * partial matches, same as the Django API: nobody can list accounts by
 * typing a few letters). Not yourself, and not anyone who blocked you. */
function tj_social_search(): void {
    $me = tj_require_user();
    tj_throttle('social_search', (string)$me['id'], 60, 60);
    $q = trim((string)($_GET['q'] ?? ''));
    $q = ltrim($q, '@');
    $db = tj_db();
    $rows = [];
    // A TJ- code (8 characters; an 8-letter username can look like one,
    // so both are tried).
    $code = strtoupper((string)preg_replace('/^TJ-?/i', '', $q));
    if (preg_match('/^[0-9A-HJKMNP-TV-Z]{8}$/', $code)) {
        $s = $db->prepare("SELECT * FROM tj_users WHERE display_id = ? AND status = 'active' AND id <> ?");
        $s->execute([$code, $me['id']]);
        $rows = $s->fetchAll();
    }
    $name = strtolower($q);
    if (tj_valid_username($name)) {
        $s = $db->prepare("SELECT * FROM tj_users WHERE username = ? AND status = 'active' AND id <> ?");
        $s->execute([$name, $me['id']]);
        $rows = array_merge($rows, $s->fetchAll());
    }
    $out = []; $seen = [];
    foreach ($rows as $u) {
        if (isset($seen[$u['id']])) continue;
        $seen[$u['id']] = true;
        if (tj_social_blocked((int)$u['id'], (int)$me['id'])) continue;
        $out[] = tj_social_card($u, tj_social_status((int)$me['id'], (int)$u['id']));
    }
    tj_json($out);
}

/* GET /social/connections — friends, requests both ways, and people I blocked. */
function tj_social_list(): void {
    $me = tj_require_user();
    $id = (int)$me['id'];
    $db = tj_db();
    $out = [];
    $q = $db->prepare("SELECT c.*, u.public_id, u.display_id, u.username FROM tj_connections c
                       JOIN tj_users u ON u.id = CASE WHEN c.requester_id = ? THEN c.addressee_id ELSE c.requester_id END
                       WHERE (c.requester_id = ? OR c.addressee_id = ?) AND u.status = 'active'
                       ORDER BY c.updated_at DESC");
    $q->execute([$id, $id, $id]);
    foreach ($q->fetchAll() as $r) {
        $status = $r['status'] === 'accepted' ? 'accepted' : ((int)$r['requester_id'] === $id ? 'pending-outgoing' : 'pending-incoming');
        $out[] = tj_social_card($r, $status);
    }
    $q = $db->prepare('SELECT u.public_id, u.display_id, u.username FROM tj_blocks b JOIN tj_users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC');
    $q->execute([$id]);
    foreach ($q->fetchAll() as $r) $out[] = tj_social_card($r, 'blocked');
    tj_json($out);
}

/* POST /social/connections/<id>/request. If they already asked me, this
 * accepts their request instead of making a second one. */
function tj_social_request(string $publicId): void {
    $me = tj_require_user();
    tj_throttle('social_request', (string)$me['id'], 30, 3600);
    $other = tj_social_other($me, $publicId);
    $a = (int)$me['id']; $b = (int)$other['id'];
    // Blocked either way: look exactly like an unknown person.
    if (tj_social_blocked($a, $b) || tj_social_blocked($b, $a)) tj_fail(404, 'not_found');
    $db = tj_db();
    $row = tj_social_row($a, $b);
    if ($row) {
        if ($row['status'] === 'pending' && (int)$row['requester_id'] === $b) {
            $db->prepare("UPDATE tj_connections SET status = 'accepted', updated_at = ? WHERE id = ?")->execute([tj_now(), $row['id']]);
            tj_json(['status' => 'accepted']);
        }
        tj_json(['status' => $row['status'] === 'accepted' ? 'accepted' : 'pending-outgoing']);
    }
    $n = $db->prepare("SELECT COUNT(*) AS n FROM tj_connections WHERE requester_id = ? AND status = 'pending'");
    $n->execute([$a]);
    if ((int)$n->fetch()['n'] >= TJ_SOCIAL_MAX_PENDING) tj_fail(429, 'too_many_pending');
    $db->prepare("INSERT INTO tj_connections (requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)")
        ->execute([$a, $b, tj_now(), tj_now()]);
    tj_json(['status' => 'pending-outgoing'], 201);
}

/* POST /social/connections/<id>/respond {accept: bool} — only to a
 * request they sent me. Declining deletes it (they can ask again). */
function tj_social_respond(string $publicId): void {
    $me = tj_require_user();
    $other = tj_social_other($me, $publicId);
    $q = tj_db()->prepare("SELECT * FROM tj_connections WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'");
    $q->execute([$other['id'], $me['id']]);
    $row = $q->fetch();
    if (!$row) tj_fail(404, 'not_found');
    $accept = !empty(tj_body()['accept']);
    if ($accept) tj_db()->prepare("UPDATE tj_connections SET status = 'accepted', updated_at = ? WHERE id = ?")->execute([tj_now(), $row['id']]);
    else tj_db()->prepare('DELETE FROM tj_connections WHERE id = ?')->execute([$row['id']]);
    tj_json(['status' => $accept ? 'accepted' : 'none']);
}

/* DELETE /social/connections/<id> — unfriend, or cancel my request. */
function tj_social_remove(string $publicId): void {
    $me = tj_require_user();
    $other = tj_social_other($me, $publicId);
    tj_db()->prepare('DELETE FROM tj_connections WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)')
        ->execute([$me['id'], $other['id'], $other['id'], $me['id']]);
    tj_json(['status' => 'none']);
}

/* PUT /social/blocks/<id> — also ends any friendship or request. */
function tj_social_block(string $publicId): void {
    $me = tj_require_user();
    $other = tj_social_other($me, $publicId);
    $db = tj_db();
    $db->prepare('DELETE FROM tj_connections WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)')
        ->execute([$me['id'], $other['id'], $other['id'], $me['id']]);
    if (!tj_social_blocked((int)$me['id'], (int)$other['id']))
        $db->prepare('INSERT INTO tj_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)')->execute([$me['id'], $other['id'], tj_now()]);
    tj_json(['status' => 'blocked']);
}

/* DELETE /social/blocks/<id>. */
function tj_social_unblock(string $publicId): void {
    $me = tj_require_user();
    $other = tj_social_other($me, $publicId);
    tj_db()->prepare('DELETE FROM tj_blocks WHERE blocker_id = ? AND blocked_id = ?')->execute([$me['id'], $other['id']]);
    tj_json(['status' => 'none']);
}
