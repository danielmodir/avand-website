<?php
/* Hijri (lunar) month starts, as Iran officially sets them.
 *
 * Iran starts each lunar month by moon sighting, so no formula is exact:
 * the app shifts the tabular formula onto the official dates it gets
 * here. The table starts from the bundled dataset
 * (public_html/assets/data/hijri-months.json, from the official 1405
 * calendar of the University of Tehran's Calendar Center) and an admin
 * with content.manage corrects a start after the sighting, or adds the
 * next year's months, from the panel — no redeploy needed.
 *
 *   GET  /calendar/hijri-months          public, what the app uses
 *   GET  /admin/calendar/hijri-months    the same, for the panel
 *   PUT  /admin/calendar/hijri-months    replace the whole list
 */
declare(strict_types=1);

function tj_hijri_seed(PDO $db): void {
    if ((int)$db->query('SELECT COUNT(*) FROM tj_hijri_months')->fetchColumn() > 0) return;
    $file = dirname(__DIR__, 2) . '/assets/data/hijri-months.json';
    $data = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    $ins = $db->prepare('INSERT INTO tj_hijri_months (hijri_year, hijri_month, starts_on, forecast, updated_at) VALUES (?, ?, ?, ?, ?)');
    foreach (($data['months'] ?? []) as $m) {
        $ins->execute([(int)$m['hijri_year'], (int)$m['hijri_month'], (string)$m['starts_on'], !empty($m['forecast']) ? 1 : 0, tj_now()]);
    }
}

function tj_hijri_months(): array {
    $db = tj_db();
    tj_hijri_seed($db);
    return array_map(function ($r) {
        return ['hijri_year' => (int)$r['hijri_year'], 'hijri_month' => (int)$r['hijri_month'], 'starts_on' => $r['starts_on'], 'forecast' => (int)$r['forecast'] === 1];
    }, $db->query('SELECT * FROM tj_hijri_months ORDER BY starts_on')->fetchAll());
}

function tj_public_hijri_months(): void {
    header('Cache-Control: public, max-age=3600');
    tj_json(['months' => tj_hijri_months(), 'source' => 'Official calendar of Iran (Calendar Center, University of Tehran Institute of Geophysics); corrected after moon sighting.']);
}

function tj_admin_hijri_months(): void {
    tj_admin_require('content.manage');
    tj_json(['months' => tj_hijri_months()]);
}

/* The list must be consecutive months, each 29 or 30 days long. */
function tj_admin_hijri_months_save(): void {
    $me = tj_admin_require('content.manage');
    $rows = tj_body()['months'] ?? null;
    if (!is_array($rows) || !$rows || count($rows) > 240) tj_fail(400, 'validation_error');
    $clean = [];
    foreach ($rows as $r) {
        $hy = (int)($r['hijri_year'] ?? 0); $hm = (int)($r['hijri_month'] ?? 0); $d = (string)($r['starts_on'] ?? '');
        if ($hy < 1400 || $hy > 1600 || $hm < 1 || $hm > 12 || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $x) || !checkdate((int)$x[2], (int)$x[3], (int)$x[1])) {
            tj_fail(400, 'validation_error', ['row' => "$hy/$hm"]);
        }
        $clean[] = ['hy' => $hy, 'hm' => $hm, 'd' => $d, 'f' => !empty($r['forecast']) ? 1 : 0];
    }
    usort($clean, function ($a, $b) { return strcmp($a['d'], $b['d']); });
    for ($i = 1; $i < count($clean); $i++) {
        $p = $clean[$i - 1]; $c = $clean[$i];
        $nextHy = $p['hm'] === 12 ? $p['hy'] + 1 : $p['hy']; $nextHm = $p['hm'] === 12 ? 1 : $p['hm'] + 1;
        $days = (strtotime($c['d'] . ' UTC') - strtotime($p['d'] . ' UTC')) / 86400;
        if ($c['hy'] !== $nextHy || $c['hm'] !== $nextHm || ($days !== 29 && $days !== 30 && $days !== 29.0 && $days !== 30.0)) {
            tj_fail(400, 'not_consecutive', ['row' => "{$c['hy']}/{$c['hm']}"]);
        }
    }
    $db = tj_db();
    tj_tx_begin($db);
    try {
        $db->exec('DELETE FROM tj_hijri_months');
        $ins = $db->prepare('INSERT INTO tj_hijri_months (hijri_year, hijri_month, starts_on, forecast, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($clean as $c) $ins->execute([$c['hy'], $c['hm'], $c['d'], $c['f'], tj_now(), $me['id']]);
        tj_tx_commit($db);
    } catch (Throwable $e) {
        tj_tx_rollback($db);
        throw $e;
    }
    tj_admin_audit((int)$me['id'], 'hijri_months_saved', count($clean) . ' months');
    tj_json(['months' => tj_hijri_months()]);
}
