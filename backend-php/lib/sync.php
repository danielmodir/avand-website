<?php
/* One JSON document per account: the app's tasks, habits, events,
 * profile, settings and period setup. Every write carries the version it
 * started from; a mismatch answers 409 with the current copy so the
 * client can merge or retry (two devices can't silently overwrite each
 * other). The "period" part is encrypted at rest with the server key.
 */
declare(strict_types=1);

const TJ_SYNC_KEYS = ['profile', 'settings', 'tasks', 'habits', 'events', 'period'];

function tj_sync_read(int $userId): array {
    $q = tj_db()->prepare('SELECT data, version, updated_at FROM tj_user_data WHERE user_id = ?');
    $q->execute([$userId]);
    $row = $q->fetch();
    if (!$row) return ['version' => 0, 'data' => new stdClass(), 'updated_at' => null];
    $data = json_decode($row['data'], true) ?: [];
    if (isset($data['period_enc'])) {
        $plain = tj_decrypt($data['period_enc']);
        $data['period'] = $plain === null ? null : json_decode($plain, true);
        unset($data['period_enc']);
    }
    return ['version' => (int)$row['version'], 'data' => $data ?: new stdClass(), 'updated_at' => $row['updated_at']];
}

function tj_sync_get(): void {
    $u = tj_require_user();
    tj_json(tj_sync_read((int)$u['id']));
}

function tj_sync_put(): void {
    $u = tj_require_user();
    $userId = (int)$u['id'];
    $b = tj_body();
    $base = $b['version'] ?? null;
    $incoming = $b['data'] ?? null;
    if (!is_int($base) || !is_array($incoming)) tj_fail(400, 'validation_error');

    // Only known sections, each of the expected JSON type.
    $clean = [];
    foreach (TJ_SYNC_KEYS as $k) {
        if (!array_key_exists($k, $incoming)) continue;
        $v = $incoming[$k];
        $isList = in_array($k, ['tasks', 'habits', 'events'], true);
        if ($v === null) continue;
        if (!is_array($v) || ($isList && $v !== array_values($v))) tj_fail(400, 'validation_error', ['field' => $k]);
        $clean[$k] = $v;
    }
    if (isset($clean['period'])) {
        $clean['period_enc'] = tj_encrypt(json_encode($clean['period'], JSON_UNESCAPED_UNICODE));
        unset($clean['period']);
    }
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > TJ_MAX_SYNC_BYTES) tj_fail(413, 'too_large');

    $db = tj_db();
    $db->beginTransaction();
    try {
        $q = $db->prepare('SELECT version FROM tj_user_data WHERE user_id = ?' . (tj_driver() === 'mysql' ? ' FOR UPDATE' : ''));
        $q->execute([$userId]);
        $row = $q->fetch();
        $current = $row ? (int)$row['version'] : 0;
        if ($base !== $current) {
            $db->rollBack();
            tj_fail(409, 'version_conflict', ['current' => tj_sync_read($userId)]);
        }
        if ($row) {
            $db->prepare('UPDATE tj_user_data SET data = ?, version = ?, updated_at = ? WHERE user_id = ?')->execute([$json, $current + 1, tj_now(), $userId]);
        } else {
            $db->prepare('INSERT INTO tj_user_data (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)')->execute([$userId, $json, 1, tj_now()]);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
    tj_json(['version' => $current + 1]);
}
