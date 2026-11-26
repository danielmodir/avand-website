<?php
/* Read-only plan for the primary calendar. Inputs are complete snapshots;
 * callers must not apply a plan without rechecking document version and
 * Google etags. Unsupported events remain in their original calendar. */
declare(strict_types=1);

require_once __DIR__ . '/google_calendar_diff.php';
require_once __DIR__ . '/google_calendar_event.php';

function tj_gcal_plan_collection(array $localRows, array $googleRows, array $links): array {
    $local = []; $google = []; $skipped = []; $plan = [];
    $unsupportedLocal = []; $unsupportedGoogle = [];
    foreach ($localRows as $row) {
        if (!is_array($row) || !is_string($row['id'] ?? null) || $row['id'] === '') continue;
        try { $local[$row['id']] = tj_gcal_local_event($row); }
        catch (DomainException $e) { $unsupportedLocal[$row['id']] = true; $skipped[] = ['side' => 'toojibee', 'id' => $row['id'], 'reason' => $e->getMessage()]; }
    }
    foreach ($googleRows as $row) {
        if (!is_array($row) || !is_string($row['id'] ?? null) || $row['id'] === '') continue;
        if (($row['status'] ?? '') === 'cancelled') continue;
        if (!is_string($row['etag'] ?? null) || $row['etag'] === '') {
            $unsupportedGoogle[$row['id']] = true;
            $skipped[] = ['side' => 'google', 'id' => $row['id'], 'reason' => 'missing_google_etag'];
            continue;
        }
        try { $google[$row['id']] = ['event' => tj_gcal_google_event($row),
            'toojibee_id' => $row['extendedProperties']['private']['toojibeeId'] ?? null,
            'etag' => $row['etag'] ?? null]; }
        catch (DomainException $e) { $unsupportedGoogle[$row['id']] = true; $skipped[] = ['side' => 'google', 'id' => $row['id'], 'reason' => $e->getMessage()]; }
    }
    $usedLocal = []; $usedGoogle = [];
    foreach ($links as $link) {
        $lid = $link['local_id'] ?? null; $gid = $link['google_id'] ?? null;
        if (!is_string($lid) || !is_string($gid) || isset($usedLocal[$lid]) || isset($usedGoogle[$gid])) continue;
        $usedLocal[$lid] = true; $usedGoogle[$gid] = true;
        $left = $local[$lid] ?? null;
        $right = $google[$gid]['event'] ?? null;
        $base = is_array($link['base'] ?? null) ? $link['base'] : null;
        $plan[] = ['local_id' => $lid, 'google_id' => $gid,
            'action' => isset($unsupportedLocal[$lid]) || isset($unsupportedGoogle[$gid]) ? 'unsupported_link'
                : ($base === null ? 'invalid_link' : tj_gcal_plan_pair($base, $left, $right)),
            'etag' => $google[$gid]['etag'] ?? null];
    }
    // A previous export carries its own stable local ID. Reconnect without
    // manufacturing a duplicate event, even if the old link row is gone.
    foreach ($google as $gid => $remote) {
        $lid = $remote['toojibee_id'];
        if (!is_string($lid) || $lid === '' || isset($usedLocal[$lid]) || isset($usedGoogle[$gid])) continue;
        $usedLocal[$lid] = true; $usedGoogle[$gid] = true;
        $plan[] = ['local_id' => $lid, 'google_id' => $gid,
            'action' => isset($local[$lid]) ? tj_gcal_plan_pair(null, $local[$lid], $remote['event']) : 'confirm_local_delete',
            'etag' => $remote['etag']];
    }
    // Identical independent records can be linked only when that exact
    // fingerprint occurs once on each side. Ambiguous duplicates stay apart.
    $localSigs = []; $googleSigs = [];
    foreach ($local as $lid => $event) if (!isset($usedLocal[$lid])) $localSigs[tj_gcal_fingerprint($event)][] = $lid;
    foreach ($google as $gid => $row) if (!isset($usedGoogle[$gid])) $googleSigs[tj_gcal_fingerprint($row['event'])][] = $gid;
    foreach ($localSigs as $sig => $lids) {
        $gids = $googleSigs[$sig] ?? [];
        if (count($lids) !== 1 || count($gids) !== 1) continue;
        $lid = $lids[0]; $gid = $gids[0];
        $usedLocal[$lid] = true; $usedGoogle[$gid] = true;
        $plan[] = ['local_id' => $lid, 'google_id' => $gid, 'action' => 'link_equal', 'etag' => $google[$gid]['etag']];
    }
    foreach ($local as $lid => $event) if (!isset($usedLocal[$lid]))
        $plan[] = ['local_id' => $lid, 'google_id' => null, 'action' => 'create_google', 'etag' => null];
    foreach ($google as $gid => $row) if (!isset($usedGoogle[$gid])) {
        $marker = $row['toojibee_id'];
        if (is_string($marker) && isset($usedLocal[$marker])) {
            $skipped[] = ['side' => 'google', 'id' => $gid, 'reason' => 'linked_elsewhere'];
            continue;
        }
        $plan[] = ['local_id' => null, 'google_id' => $gid, 'action' => 'create_local', 'etag' => $row['etag']];
    }
    foreach ($plan as &$row) {
        $lid = $row['local_id']; $gid = $row['google_id'];
        $left = $lid !== null ? ($local[$lid] ?? null) : null;
        $right = $gid !== null ? ($google[$gid]['event'] ?? null) : null;
        $row['local_event'] = $left;
        $row['google_event'] = $right;
    }
    unset($row);
    return ['actions' => $plan, 'skipped' => $skipped];
}
