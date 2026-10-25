<?php
/* Group planning: a group has a name, an owner and members (friends the
 * owner ticked, or anyone who opened its link). Members share the group's
 * tasks, habits and events; each item is ticked either by each person on
 * their own ("each") or once for everybody ("shared"). Every member picks
 * the group's color for themselves; nobody else sees it. Only the owner
 * deletes the group (or edits its name and members); the others can leave.
 * Same paths and shapes as the Django API's social module. */
declare(strict_types=1);

const TJ_GROUPS_MAX = 20;          // groups one person can be in
const TJ_GROUP_MEMBERS_MAX = 30;
const TJ_GROUP_ITEMS_MAX = 500;
const TJ_GROUP_ITEM_BYTES = 400000; // one item's JSON (photos are data URLs)
const TJ_GROUP_KINDS = ['task', 'habit', 'event'];

function tj_group_color($c): ?string {
    return is_string($c) && preg_match('/^#[0-9A-Fa-f]{6}$/', $c) ? strtoupper($c) : null;
}

/* The group by public id, with my membership row; 404 if I'm not in it. */
function tj_group_mine(array $me, string $publicId): array {
    if (!preg_match('/^[a-f0-9]{32}$/', $publicId)) tj_fail(404, 'not_found');
    $q = tj_db()->prepare('SELECT g.*, m.color AS my_color FROM tj_groups g JOIN tj_group_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.public_id = ?');
    $q->execute([$me['id'], $publicId]);
    $g = $q->fetch();
    if (!$g) tj_fail(404, 'not_found');
    return $g;
}

function tj_group_is_owner(array $g, array $me): bool { return (int)$g['owner_id'] === (int)$me['id']; }

function tj_group_count_for(int $userId): int {
    $q = tj_db()->prepare('SELECT COUNT(*) AS n FROM tj_group_members WHERE user_id = ?');
    $q->execute([$userId]);
    return (int)$q->fetch()['n'];
}

function tj_group_new_token(): string {
    $q = tj_db()->prepare('SELECT 1 FROM tj_groups WHERE invite_token = ?');
    do { $tok = tj_random_code(20); $q->execute([$tok]); } while ($q->fetch());
    return $tok;
}

/* Friends' public ids -> numeric ids; every one must be an accepted friend. */
function tj_group_friend_ids(array $me, $ids): array {
    if (!is_array($ids)) tj_fail(400, 'validation_error', ['fields' => ['members' => ['invalid']]]);
    $out = [];
    $q = tj_db()->prepare("SELECT id FROM tj_users WHERE public_id = ? AND status = 'active'");
    foreach (array_unique($ids) as $pid) {
        if (!is_string($pid) || !preg_match('/^[a-f0-9]{32}$/', $pid)) tj_fail(400, 'validation_error', ['fields' => ['members' => ['invalid']]]);
        $q->execute([$pid]);
        $id = (int)($q->fetch()['id'] ?? 0);
        if (!$id || !tj_social_are_friends((int)$me['id'], $id)) tj_fail(400, 'not_a_friend');
        $out[] = $id;
    }
    return $out;
}

function tj_group_add_member(int $groupId, int $userId, string $color): void {
    $q = tj_db()->prepare('SELECT 1 FROM tj_group_members WHERE group_id = ? AND user_id = ?');
    $q->execute([$groupId, $userId]);
    if ($q->fetch()) return;
    tj_db()->prepare('INSERT INTO tj_group_members (group_id, user_id, color, joined_at) VALUES (?, ?, ?, ?)')->execute([$groupId, $userId, $color, tj_now()]);
}

/* GET /groups — my groups, their members, items and ticks. */
function tj_groups_payload(array $me): array {
    $db = tj_db();
    $uid = (int)$me['id'];
    $q = $db->prepare('SELECT g.*, m.color AS my_color FROM tj_groups g JOIN tj_group_members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY m.joined_at');
    $q->execute([$uid]);
    $groups = [];
    $byId = [];
    foreach ($q->fetchAll() as $g) {
        $owner = (int)$g['owner_id'] === $uid;
        $byId[(int)$g['id']] = $g['public_id'];
        $groups[(int)$g['id']] = [
            'id' => $g['public_id'], 'name' => $g['name'], 'color' => $g['my_color'],
            'owner' => $owner, 'token' => $g['invite_token'], 'members' => [],
        ];
    }
    if (!$groups) return ['groups' => [], 'items' => []];
    $in = implode(',', array_keys($groups));
    $mq = $db->query("SELECT m.group_id, u.id, u.public_id, u.display_id, u.username FROM tj_group_members m JOIN tj_users u ON u.id = m.user_id
                      WHERE m.group_id IN ($in) AND u.status = 'active' ORDER BY m.joined_at");
    $owners = [];
    foreach ($groups as $gid => $g) $owners[$gid] = null;
    $ownerQ = $db->query("SELECT id, owner_id FROM tj_groups WHERE id IN ($in)");
    foreach ($ownerQ->fetchAll() as $r) $owners[(int)$r['id']] = (int)$r['owner_id'];
    foreach ($mq->fetchAll() as $m) {
        $groups[(int)$m['group_id']]['members'][] = tj_social_card($m, 'member') + [
            'owner' => (int)$m['id'] === $owners[(int)$m['group_id']], 'me' => (int)$m['id'] === $uid,
        ];
    }
    $items = [];
    $iq = $db->query("SELECT i.*, u.public_id AS by_public FROM tj_group_items i LEFT JOIN tj_users u ON u.id = i.created_by WHERE i.group_id IN ($in) ORDER BY i.id");
    $rows = $iq->fetchAll();
    $marks = [];
    if ($rows) {
        $ids = implode(',', array_map(function ($r) { return (int)$r['id']; }, $rows));
        $kq = $db->query("SELECT k.item_id, k.mark_key, k.status, u.public_id, u.display_id, u.username, u.id AS uid FROM tj_group_marks k JOIN tj_users u ON u.id = k.user_id WHERE k.item_id IN ($ids)");
        foreach ($kq->fetchAll() as $k) {
            $marks[(int)$k['item_id']][] = [
                'key' => $k['mark_key'], 'status' => $k['status'], 'user' => $k['public_id'],
                'name' => $k['username'] ? '@' . $k['username'] : 'TJ-' . $k['display_id'], 'me' => (int)$k['uid'] === $uid,
            ];
        }
    }
    foreach ($rows as $r) {
        $items[] = [
            'id' => $r['item_id'], 'group' => $byId[(int)$r['group_id']], 'kind' => $r['kind'],
            'data' => json_decode((string)$r['data'], true) ?: new stdClass(), 'done_mode' => $r['done_mode'],
            'by' => $r['by_public'], 'mine' => (int)$r['created_by'] === $uid,
            'marks' => $marks[(int)$r['id']] ?? [],
        ];
    }
    return ['groups' => array_values($groups), 'items' => $items];
}

function tj_groups_list(): void {
    tj_json(tj_groups_payload(tj_require_user()));
}

/* POST /groups {name, color, members: [friend public ids]} */
function tj_group_create(): void {
    $me = tj_require_user();
    tj_throttle('group_create', (string)$me['id'], 20, 3600);
    $b = tj_body();
    $name = tj_str($b, 'name', 60);
    if ($name === '') tj_fail(400, 'validation_error', ['fields' => ['name' => ['required']]]);
    $color = tj_group_color($b['color'] ?? null);
    if (!$color) tj_fail(400, 'validation_error', ['fields' => ['color' => ['invalid']]]);
    $friends = tj_group_friend_ids($me, $b['members'] ?? []);
    if (count($friends) + 1 > TJ_GROUP_MEMBERS_MAX) tj_fail(400, 'too_many', ['max' => TJ_GROUP_MEMBERS_MAX]);
    if (tj_group_count_for((int)$me['id']) >= TJ_GROUPS_MAX) tj_fail(429, 'too_many_groups', ['max' => TJ_GROUPS_MAX]);
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $pid = tj_new_public_id();
        $db->prepare('INSERT INTO tj_groups (public_id, name, owner_id, invite_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$pid, $name, $me['id'], tj_group_new_token(), tj_now(), tj_now()]);
        $gid = (int)$db->lastInsertId();
        tj_group_add_member($gid, (int)$me['id'], $color);
        // Friends start with the same color; each can change their own.
        foreach ($friends as $f) if (tj_group_count_for($f) < TJ_GROUPS_MAX) tj_group_add_member($gid, $f, $color);
        tj_tx_commit($db);
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        throw $e;
    }
    tj_json(tj_groups_payload($me) + ['created' => $pid], 201);
}

/* PATCH /groups/<id> {color} anyone (their own color); {name, members} owner only. */
function tj_group_update(string $publicId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    $b = tj_body();
    $db = tj_db();
    if (array_key_exists('color', $b)) {
        $color = tj_group_color($b['color']);
        if (!$color) tj_fail(400, 'validation_error', ['fields' => ['color' => ['invalid']]]);
        $db->prepare('UPDATE tj_group_members SET color = ? WHERE group_id = ? AND user_id = ?')->execute([$color, $g['id'], $me['id']]);
    }
    if (array_key_exists('name', $b) || array_key_exists('members', $b)) {
        if (!tj_group_is_owner($g, $me)) tj_fail(403, 'not_owner');
        if (array_key_exists('name', $b)) {
            $name = tj_str($b, 'name', 60);
            if ($name === '') tj_fail(400, 'validation_error', ['fields' => ['name' => ['required']]]);
            $db->prepare('UPDATE tj_groups SET name = ?, updated_at = ? WHERE id = ?')->execute([$name, tj_now(), $g['id']]);
        }
        if (array_key_exists('members', $b)) {
            // The whole list of other members: friends to add; anyone left
            // out (friend or link-joiner) is removed. The owner always stays.
            $ids = $b['members'];
            if (!is_array($ids)) tj_fail(400, 'validation_error', ['fields' => ['members' => ['invalid']]]);
            $keep = []; $add = [];
            $cur = $db->prepare('SELECT u.id, u.public_id FROM tj_group_members m JOIN tj_users u ON u.id = m.user_id WHERE m.group_id = ?');
            $cur->execute([$g['id']]);
            $current = [];
            foreach ($cur->fetchAll() as $r) $current[$r['public_id']] = (int)$r['id'];
            $newFriends = [];
            foreach (array_unique($ids) as $pid) {
                if (!is_string($pid)) tj_fail(400, 'validation_error', ['fields' => ['members' => ['invalid']]]);
                if (isset($current[$pid])) $keep[] = $current[$pid]; else $newFriends[] = $pid;
            }
            $add = tj_group_friend_ids($me, $newFriends);
            if (count($keep) + count($add) + 1 > TJ_GROUP_MEMBERS_MAX) tj_fail(400, 'too_many', ['max' => TJ_GROUP_MEMBERS_MAX]);
            tj_tx_begin($db);
            try {
                foreach ($current as $uid) {
                    if ($uid === (int)$me['id'] || in_array($uid, $keep, true)) continue;
                    tj_group_drop_member((int)$g['id'], $uid);
                }
                foreach ($add as $f) if (tj_group_count_for($f) < TJ_GROUPS_MAX) tj_group_add_member((int)$g['id'], $f, $g['my_color']);
                tj_tx_commit($db);
            } catch (Throwable $e) {
                tj_tx_rollback($db);
                throw $e;
            }
        }
    }
    tj_json(tj_groups_payload($me));
}

/* A member leaves: their own ticks go with them; items they made stay. */
function tj_group_drop_member(int $groupId, int $userId): void {
    $db = tj_db();
    $db->prepare('DELETE FROM tj_group_marks WHERE user_id = ? AND item_id IN (SELECT id FROM tj_group_items WHERE group_id = ?)')->execute([$userId, $groupId]);
    $db->prepare('DELETE FROM tj_group_members WHERE group_id = ? AND user_id = ?')->execute([$groupId, $userId]);
}

/* DELETE /groups/<id> — owner only; everything in it goes. */
function tj_group_delete(string $publicId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    if (!tj_group_is_owner($g, $me)) tj_fail(403, 'not_owner');
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $db->prepare('DELETE FROM tj_group_marks WHERE item_id IN (SELECT id FROM tj_group_items WHERE group_id = ?)')->execute([$g['id']]);
        $db->prepare('DELETE FROM tj_group_items WHERE group_id = ?')->execute([$g['id']]);
        $db->prepare('DELETE FROM tj_group_members WHERE group_id = ?')->execute([$g['id']]);
        $db->prepare('DELETE FROM tj_groups WHERE id = ?')->execute([$g['id']]);
        tj_tx_commit($db);
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        throw $e;
    }
    tj_json(tj_groups_payload($me));
}

/* POST /groups/<id>/leave — not the owner (the owner deletes instead). */
function tj_group_leave(string $publicId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    if (tj_group_is_owner($g, $me)) tj_fail(400, 'owner_cannot_leave');
    tj_group_drop_member((int)$g['id'], (int)$me['id']);
    tj_json(tj_groups_payload($me));
}

/* POST /groups/<id>/invite/reset — owner: a new link, the old one stops working. */
function tj_group_invite_reset(string $publicId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    if (!tj_group_is_owner($g, $me)) tj_fail(403, 'not_owner');
    tj_throttle('group_invite_reset', (string)$me['id'], 20, 3600);
    tj_db()->prepare('UPDATE tj_groups SET invite_token = ?, updated_at = ? WHERE id = ?')->execute([tj_group_new_token(), tj_now(), $g['id']]);
    tj_json(tj_groups_payload($me));
}

/* POST /groups/join {token} — opened a group's link: in, straight away. */
function tj_group_join(): void {
    $me = tj_require_user();
    tj_throttle('group_join', (string)$me['id'], 30, 3600);
    $tok = strtoupper(trim((string)(tj_body()['token'] ?? '')));
    if (!preg_match('/^[0-9A-HJKMNP-TV-Z]{20}$/', $tok)) tj_fail(404, 'group_not_found');
    $q = tj_db()->prepare('SELECT g.*, m.color AS owner_color FROM tj_groups g JOIN tj_group_members m ON m.group_id = g.id AND m.user_id = g.owner_id WHERE g.invite_token = ?');
    $q->execute([$tok]);
    $g = $q->fetch();
    if (!$g) tj_fail(404, 'group_not_found');
    $c = tj_db()->prepare('SELECT COUNT(*) AS n FROM tj_group_members WHERE group_id = ?');
    $c->execute([$g['id']]);
    $already = tj_db()->prepare('SELECT 1 FROM tj_group_members WHERE group_id = ? AND user_id = ?');
    $already->execute([$g['id'], $me['id']]);
    if (!$already->fetch()) {
        if (tj_social_blocked((int)$g['owner_id'], (int)$me['id'])) tj_fail(404, 'group_not_found');
        if ((int)$c->fetch()['n'] >= TJ_GROUP_MEMBERS_MAX) tj_fail(400, 'group_full', ['max' => TJ_GROUP_MEMBERS_MAX]);
        if (tj_group_count_for((int)$me['id']) >= TJ_GROUPS_MAX) tj_fail(429, 'too_many_groups', ['max' => TJ_GROUPS_MAX]);
        tj_group_add_member((int)$g['id'], (int)$me['id'], (string)$g['owner_color']);
    }
    tj_json(tj_groups_payload($me) + ['joined' => $g['public_id'], 'name' => $g['name']]);
}

/* The item row in this group by the app's id, or null. */
function tj_group_item(array $g, string $itemId): ?array {
    $q = tj_db()->prepare('SELECT * FROM tj_group_items WHERE group_id = ? AND item_id = ?');
    $q->execute([$g['id'], $itemId]);
    return $q->fetch() ?: null;
}

function tj_group_item_id(string $itemId): string {
    if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $itemId)) tj_fail(404, 'not_found');
    return $itemId;
}

/* PUT /groups/<id>/items/<item id> {kind, data, done_mode} — any member
 * adds; the one who made it (or the owner) edits. */
function tj_group_item_put(string $publicId, string $itemId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    $itemId = tj_group_item_id($itemId);
    $b = tj_body();
    $kind = (string)($b['kind'] ?? '');
    if (!in_array($kind, TJ_GROUP_KINDS, true)) tj_fail(400, 'validation_error', ['fields' => ['kind' => ['invalid']]]);
    $data = $b['data'] ?? null;
    if (!is_array($data) || $data === array_values($data) && $data !== []) tj_fail(400, 'validation_error', ['fields' => ['data' => ['invalid']]]);
    $mode = ($b['done_mode'] ?? 'each') === 'shared' ? 'shared' : 'each';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > TJ_GROUP_ITEM_BYTES) tj_fail(413, 'too_large');
    $db = tj_db();
    $row = tj_group_item($g, $itemId);
    if ($row) {
        if ((int)$row['created_by'] !== (int)$me['id'] && !tj_group_is_owner($g, $me)) tj_fail(403, 'not_yours');
        if ($row['kind'] !== $kind) tj_fail(400, 'validation_error', ['fields' => ['kind' => ['invalid']]]);
        $db->prepare('UPDATE tj_group_items SET data = ?, done_mode = ?, updated_at = ? WHERE id = ?')->execute([$json, $mode, tj_now(), $row['id']]);
    } else {
        $other = $db->prepare('SELECT 1 FROM tj_group_items WHERE item_id = ?');
        $other->execute([$itemId]);
        if ($other->fetch()) tj_fail(409, 'id_taken');
        $n = $db->prepare('SELECT COUNT(*) AS n FROM tj_group_items WHERE group_id = ?');
        $n->execute([$g['id']]);
        if ((int)$n->fetch()['n'] >= TJ_GROUP_ITEMS_MAX) tj_fail(400, 'too_many', ['max' => TJ_GROUP_ITEMS_MAX]);
        $db->prepare('INSERT INTO tj_group_items (group_id, item_id, kind, data, done_mode, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$g['id'], $itemId, $kind, $json, $mode, $me['id'], tj_now(), tj_now()]);
    }
    tj_json(['ok' => true]);
}

/* DELETE /groups/<id>/items/<item id> — the one who made it, or the owner. */
function tj_group_item_delete(string $publicId, string $itemId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    $row = tj_group_item($g, tj_group_item_id($itemId));
    if (!$row) tj_json(['ok' => true]);
    if ((int)$row['created_by'] !== (int)$me['id'] && !tj_group_is_owner($g, $me)) tj_fail(403, 'not_yours');
    $db = tj_db();
    $db->prepare('DELETE FROM tj_group_marks WHERE item_id = ?')->execute([$row['id']]);
    $db->prepare('DELETE FROM tj_group_items WHERE id = ?')->execute([$row['id']]);
    tj_json(['ok' => true]);
}

/* PUT /groups/<id>/items/<item id>/marks {key, status} — my tick for one
 * day (or one subtask): status done | not_done, or null to clear it. */
function tj_group_item_mark(string $publicId, string $itemId): void {
    $me = tj_require_user();
    $g = tj_group_mine($me, $publicId);
    $row = tj_group_item($g, tj_group_item_id($itemId));
    if (!$row) tj_fail(404, 'not_found');
    $b = tj_body();
    $key = (string)($b['key'] ?? '');
    if (!preg_match('/^(\d{4}-\d{2}-\d{2}|once)(:[A-Za-z0-9-]{8,64})?$/', $key)) tj_fail(400, 'validation_error', ['fields' => ['key' => ['invalid']]]);
    $status = $b['status'] ?? null;
    if ($status !== null && !in_array($status, ['done', 'not_done'], true)) tj_fail(400, 'validation_error', ['fields' => ['status' => ['invalid']]]);
    $db = tj_db();
    // One tick for everybody: whoever changes it changes it for all.
    if ($row['done_mode'] === 'shared') $db->prepare('DELETE FROM tj_group_marks WHERE item_id = ? AND mark_key = ?')->execute([$row['id'], $key]);
    else $db->prepare('DELETE FROM tj_group_marks WHERE item_id = ? AND user_id = ? AND mark_key = ?')->execute([$row['id'], $me['id'], $key]);
    if ($status !== null) {
        $db->prepare('INSERT INTO tj_group_marks (item_id, user_id, mark_key, status, updated_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$row['id'], $me['id'], $key, $status, tj_now()]);
    }
    tj_json(['ok' => true]);
}
