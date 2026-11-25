<?php
/* Pure three-way comparison for a mapped Toojibee/Google event pair.
 * Applying actions is deliberately separate: the caller must re-check the
 * local document version and Google's etag before any write. */
declare(strict_types=1);

function tj_gcal_canonical($value) {
    if (!is_array($value)) return $value;
    if (array_keys($value) === range(0, count($value) - 1))
        return array_map('tj_gcal_canonical', $value);
    ksort($value);
    foreach ($value as $key => $item) $value[$key] = tj_gcal_canonical($item);
    return $value;
}

function tj_gcal_fingerprint(array $event): string {
    return hash('sha256', json_encode(tj_gcal_canonical($event), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
}

/* Returns an action, not a side effect. Null means the event was deleted.
 * $base is the canonical event at the last successful sync. The two current
 * values have already been projected onto the same supported field set. */
function tj_gcal_plan_pair(?array $base, ?array $local, ?array $google): string {
    if ($base === null) {
        if ($local !== null && $google === null) return 'create_google';
        if ($local === null && $google !== null) return 'create_local';
        if ($local === null && $google === null) return 'none';
        return tj_gcal_fingerprint($local) === tj_gcal_fingerprint($google) ? 'link_equal' : 'conflict_initial';
    }
    if ($local === null && $google === null) return 'unlink';
    if ($local === null) return 'confirm_local_delete';
    if ($google === null) return 'confirm_google_delete';
    $before = tj_gcal_fingerprint($base);
    $left = tj_gcal_fingerprint($local);
    $right = tj_gcal_fingerprint($google);
    if ($left === $right) return $left === $before ? 'none' : 'link_equal';
    if ($left === $before) return 'update_local';
    if ($right === $before) return 'update_google';
    return 'conflict_both_edited';
}
