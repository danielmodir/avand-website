<?php
/* Dates on the server, the same way the app does them
 * (frontend/demo/js/core/calendars.js and occasions.js):
 * - Jalali (Solar Hijri) by the standard arithmetic;
 * - Hijri from Iran's official month starts (tj_hijri_months, see
 *   lib/calendar.php), and outside that table the tabular formula
 *   shifted onto the nearest official month;
 * - occasions from the bundled dataset (assets/data/occasions.json).
 * Used by today.php (the "today's date" page). */
declare(strict_types=1);

const TJ_JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const TJ_JALALI_MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
const TJ_HIJRI_MONTHS = ['محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذیقعده', 'ذیحجه'];
const TJ_HIJRI_MONTHS_EN = ['Muharram', 'Safar', "Rabi' I", "Rabi' II", 'Jumada I', 'Jumada II', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'];
const TJ_WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const TJ_ISLAMIC_EPOCH = 1948440;

function tj_fa_digits(string $s): string {
    return strtr($s, ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']);
}

/* Gregorian -> Jalali. */
function tj_jalali(int $gy, int $gm, int $gd): array {
    $g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    $gy2 = $gm > 2 ? $gy + 1 : $gy;
    $days = 355666 + (365 * $gy) + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100) + intdiv($gy2 + 399, 400) + $gd + $g_d_m[$gm - 1];
    $jy = -1595 + (33 * intdiv($days, 12053));
    $days %= 12053;
    $jy += 4 * intdiv($days, 1461);
    $days %= 1461;
    if ($days > 365) { $jy += intdiv($days - 1, 365); $days = ($days - 1) % 365; }
    $jm = $days < 186 ? 1 + intdiv($days, 31) : 7 + intdiv($days - 186, 30);
    $jd = 1 + ($days < 186 ? $days % 31 : ($days - 186) % 30);
    return [$jy, $jm, $jd];
}

function tj_g2jdn(int $y, int $m, int $d): int {
    $a = intdiv(14 - $m, 12); $y2 = $y + 4800 - $a; $m2 = $m + 12 * $a - 3;
    return $d + intdiv(153 * $m2 + 2, 5) + 365 * $y2 + intdiv($y2, 4) - intdiv($y2, 100) + intdiv($y2, 400) - 32045;
}

function tj_jdn2g(int $jdn): array {
    $a = $jdn + 32044; $b = intdiv(4 * $a + 3, 146097); $c = $a - intdiv(146097 * $b, 4);
    $d = intdiv(4 * $c + 3, 1461); $e = $c - intdiv(1461 * $d, 4); $m = intdiv(5 * $e + 2, 153);
    return [100 * $b + $d - 4800 + intdiv($m, 10), $m + 3 - 12 * intdiv($m, 10), $e - intdiv(153 * $m + 2, 5) + 1];
}

/* Tabular Islamic calendar (same formula as the app). */
function tj_hijri_tabular(int $jdn): array {
    $l = $jdn - TJ_ISLAMIC_EPOCH + 10632;
    $n = intdiv($l - 1, 10631);
    $l = $l - 10631 * $n + 354;
    $j = intdiv(10985 - $l, 5316) * intdiv(50 * $l, 17719) + intdiv($l, 5670) * intdiv(43 * $l, 15238);
    $l = $l - intdiv(30 - $j, 15) * intdiv(17719 * $j, 50) - intdiv($j, 16) * intdiv(15238 * $j, 43) + 29;
    $hm = intdiv(24 * $l, 709);
    return [30 * $n + $j - 30, $hm, $l - intdiv(709 * $hm, 24)];
}

function tj_hijri_month_start_tabular(int $hy, int $hm): int {
    return (int)ceil(29.5 * ($hm - 1)) + ($hy - 1) * 354 + intdiv(3 + 11 * $hy, 30) + TJ_ISLAMIC_EPOCH;
}

/* Official month starts as [jdn, hy, hm], sorted. */
function tj_hijri_table(): array {
    static $t = null;
    if ($t !== null) return $t;
    $t = [];
    try {
        foreach (tj_hijri_months() as $m) {
            [$y, $mo, $d] = array_map('intval', explode('-', $m['starts_on']));
            $t[] = [tj_g2jdn($y, $mo, $d), $m['hijri_year'], $m['hijri_month']];
        }
    } catch (Throwable $e) { /* no table: formula only */ }
    return $t;
}

/* Gregorian -> Hijri, official where known. */
function tj_hijri(int $gy, int $gm, int $gd): array {
    $jdn = tj_g2jdn($gy, $gm, $gd);
    $t = tj_hijri_table();
    for ($i = count($t) - 1; $i >= 0; $i--) {
        if ($t[$i][0] > $jdn) continue;
        [$start, $hy, $hm] = $t[$i];
        $next = $t[$i + 1][0] ?? (tj_hijri_month_start_tabular($hm === 12 ? $hy + 1 : $hy, $hm === 12 ? 1 : $hm + 1) + tj_hijri_shift($t, true));
        if ($jdn - $start < min($next - $start, 30)) return [$hy, $hm, $jdn - $start + 1];
        break;
    }
    if (!$t) return tj_hijri_tabular($jdn);
    return tj_hijri_tabular($jdn - tj_hijri_shift($t, $jdn >= $t[0][0]));
}

function tj_hijri_shift(array $t, bool $after): int {
    if (!$t) return 0;
    $row = $after ? $t[count($t) - 1] : $t[0];
    return $row[0] - tj_hijri_month_start_tabular($row[1], $row[2]);
}

/* Occasions of a Gregorian date: [['title' => …, 'holiday' => bool, 'calendar' => …], …]. */
function tj_occasions_on(int $gy, int $gm, int $gd): array {
    static $data = null;
    if ($data === null) {
        $file = dirname(__DIR__, 2) . '/assets/data/occasions.json';
        $data = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
    }
    $sh = array_flip(TJ_JALALI_MONTHS); $sh['اَمرداد'] = 4;
    $gr = ['January' => 1, 'February' => 2, 'March' => 3, 'April' => 4, 'May' => 5, 'June' => 6, 'July' => 7, 'August' => 8, 'September' => 9, 'October' => 10, 'November' => 11, 'December' => 12];
    $hi = ['محرم' => 1, 'صفر' => 2, 'ربيع الاول' => 3, 'ربيع الثاني' => 4, 'جمادي الاولي' => 5, 'جمادي الثانيه' => 6, 'رجب' => 7, 'شعبان' => 8, 'رمضان' => 9, 'شوال' => 10, 'ذوالقعده' => 11, 'ذوالحجه' => 12];
    [, $jm, $jd] = tj_jalali($gy, $gm, $gd);
    [, $hm, $hd] = tj_hijri($gy, $gm, $gd);
    $out = [];
    foreach ($data as $o) {
        $parts = $o['date']['date'] ?? [];
        $day = (int)array_shift($parts);
        $month = implode(' ', $parts);
        $type = $o['date']['type'] ?? '';
        $hit = ($type === 'shamsi' && isset($sh[$month]) && $sh[$month] + 1 === $jm && $day === $jd)
            || ($type === 'gregorian' && ($gr[$month] ?? 0) === $gm && $day === $gd)
            || ($type === 'hijri' && ($hi[$month] ?? 0) === $hm && $day === $hd);
        if ($hit) $out[] = ['title' => (string)$o['event_name'], 'holiday' => !empty($o['is_holiday']), 'calendar' => $type];
    }
    return $out;
}
