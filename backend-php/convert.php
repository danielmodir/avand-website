<?php
/* Date converter (/fa/convert/, /en/convert/): Solar Hijri <-> Gregorian
 * <-> Hijri (Iran's official month starts where known). A plain GET form,
 * worked out on the server: no script needed, and today's conversion is
 * already in the page for search engines. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/dates.php';
require __DIR__ . '/lib/articles.php';
require __DIR__ . '/lib/page.php';

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$fa = $lang === 'fa';
$n = function ($v) use ($fa): string { return $fa ? tj_fa_digits((string)$v) : (string)$v; };

$now = new DateTime('now', new DateTimeZone('Asia/Tehran'));
$todayG = [(int)$now->format('Y'), (int)$now->format('n'), (int)$now->format('j')];
$today = tj_day_labels($todayG, $fa);

$cals = ['jalali' => $fa ? 'شمسی (هجری خورشیدی)' : 'Solar Hijri (Persian)', 'gregorian' => $fa ? 'میلادی' : 'Gregorian', 'hijri' => $fa ? 'قمری (هجری قمری)' : 'Lunar Hijri (Islamic)'];
$from = isset($_GET['from'], $cals[$_GET['from']]) ? $_GET['from'] : 'jalali';
$asked = isset($_GET['y'], $_GET['m'], $_GET['d']);
$y = (int)($_GET['y'] ?? 0); $m = (int)($_GET['m'] ?? 0); $d = (int)($_GET['d'] ?? 0);
if (!$asked) { [$y, $m, $d] = $today[$from === 'jalali' ? 'j' : ($from === 'hijri' ? 'h' : 'g')]; }

$g = null;
if ($from === 'jalali' && $y >= 1200 && $y <= 1600) $g = tj_jalali_to_g($y, $m, $d);
if ($from === 'hijri' && $y >= 1300 && $y <= 1600) $g = tj_hijri_to_g($y, $m, $d);
if ($from === 'gregorian' && $y >= 1800 && $y <= 2200 && checkdate($m, $d, $y)) $g = [$y, $m, $d];
$res = $g ? tj_day_labels($g, $fa) : null;

$monthNames = ['jalali' => $fa ? TJ_JALALI_MONTHS : TJ_JALALI_MONTHS_EN, 'hijri' => $fa ? TJ_HIJRI_MONTHS : TJ_HIJRI_MONTHS_EN, 'gregorian' => $fa ? TJ_GREG_MONTHS_FA : TJ_EN_MONTHS];

// The form: one per "from" calendar, so each keeps its own month names.
$forms = '';
foreach ($cals as $key => $label) {
    $sel = $key === $from;
    [$fy, $fm, $fd] = $sel ? [$y, $m, $d] : $today[$key === 'jalali' ? 'j' : ($key === 'hijri' ? 'h' : 'g')];
    $opts = '';
    foreach ($monthNames[$key] as $i => $mn) $opts .= '<option value="' . ($i + 1) . '"' . ($i + 1 === $fm ? ' selected' : '') . '>' . tj_h($mn) . '</option>';
    $days = '';
    for ($i = 1; $i <= 31; $i++) $days .= '<option value="' . $i . '"' . ($i === $fd ? ' selected' : '') . '>' . $n($i) . '</option>';
    $forms .= '<form class="conv-form" method="get" action="/' . $lang . '/convert/">'
        . '<input type="hidden" name="from" value="' . $key . '">'
        . '<h2>' . ($fa ? 'از تاریخ ' : 'From ') . tj_h($label) . '</h2>'
        . '<div class="conv-row">'
        . '<label><span>' . ($fa ? 'روز' : 'Day') . '</span><select name="d">' . $days . '</select></label>'
        . '<label><span>' . ($fa ? 'ماه' : 'Month') . '</span><select name="m">' . $opts . '</select></label>'
        . '<label><span>' . ($fa ? 'سال' : 'Year') . '</span><input type="number" name="y" inputmode="numeric" value="' . $fy . '"></label>'
        . '<button class="btn btn-primary" type="submit">' . ($fa ? 'تبدیل کن' : 'Convert') . '</button></div></form>';
}

$result = '';
if ($asked && !$res) {
    $result = '<p class="conv-error">' . ($fa ? 'این تاریخ وجود نداره یا خارج از بازه‌ست؛ روز و ماه رو دوباره نگاه کن.' : "That date doesn't exist or is out of range; check the day and month.") . '</p>';
} elseif ($res) {
    $diff = (int)round((tj_g2jdn(...$res['g']) - tj_g2jdn(...$todayG)));
    $rel = $diff === 0 ? ($fa ? 'امروز' : 'today')
        : ($fa ? $n(abs($diff)) . ' روز ' . ($diff > 0 ? 'بعد از امروز' : 'قبل از امروز') : abs($diff) . ' days ' . ($diff > 0 ? 'from today' : 'ago'));
    $occ = tj_occasions_on(...$res['g']);
    $occHtml = $occ ? '<ul class="today-occasions">' . implode('', array_map(function ($o) use ($fa) {
        return '<li' . ($o['holiday'] ? ' class="holiday"' : '') . '>' . tj_h($o['title']) . ($o['holiday'] ? ' <span class="today-tag">' . ($fa ? 'تعطیل' : 'holiday') . '</span>' : '') . '</li>';
    }, $occ)) . '</ul>' : '';
    $result = '<div class="conv-result" aria-live="polite"><p class="conv-weekday">' . tj_h($res['weekday']) . ' · ' . tj_h($rel) . '</p>'
        . '<dl class="conv-dates">'
        . '<dt>' . ($fa ? 'شمسی' : 'Solar Hijri') . '</dt><dd>' . tj_h($res['jalali']) . '</dd>'
        . '<dt>' . ($fa ? 'میلادی' : 'Gregorian') . '</dt><dd>' . tj_h($res['gregorian']) . '</dd>'
        . '<dt>' . ($fa ? 'قمری' : 'Lunar Hijri') . '</dt><dd>' . tj_h($res['hijri']) . '</dd></dl>' . $occHtml . '</div>';
}

[$jyNow] = $today['j'];
$nowruz = tj_jalali_to_g($jyNow + 1, 1, 1);
$nowruzL = $nowruz ? tj_day_labels($nowruz, $fa) : null;
$faq = $fa ? [
    ['تاریخ امروز به شمسی، میلادی و قمری چنده؟', "امروز {$today['weekday']} {$today['jalali']} برابر با {$today['gregorian']} و {$today['hijri']} است."],
    ['تبدیل تاریخ شمسی به میلادی چطور انجام می‌شه؟', 'سال شمسی با نوروز (اعتدال بهاری، حدود ۲۰ یا ۲۱ مارس) شروع می‌شه؛ شش ماه اول ۳۱ روزه، پنج ماه بعد ۳۰ روزه و اسفند ۲۹ یا (در سال کبیسه) ۳۰ روزه‌ست. این صفحه روزها رو از همون مبدأ می‌شمره و دقیق تبدیل می‌کنه.'],
    ['تاریخ قمری این مبدل دقیقه؟', 'برای ماه‌هایی که اعلام رسمی شده، شروع ماه طبق تقویم رسمی کشور حساب می‌شه؛ برای ماه‌های آینده تخمینیه و ممکنه با رؤیت هلال یک روز جابه‌جا بشه.'],
] : [
    ["What is today's date in the Persian calendar?", "Today is {$today['weekday']}, {$today['jalali']} (Solar Hijri), which is {$today['gregorian']} and {$today['hijri']} (Lunar Hijri)."],
    ['How is a Persian date converted to Gregorian?', 'The Solar Hijri year starts at Nowruz, the March equinox (around 20 or 21 March). The first six months have 31 days, the next five 30, and Esfand 29 (30 in a leap year). This page counts days from that start, so the conversion is exact.'],
    ['How accurate are the Hijri dates?', "Months already announced follow Iran's official calendar; future months are estimates and may shift by a day after the new moon is sighted."],
];
if ($nowruzL) $faq[] = $fa ? ['نوروز سال بعد چه روزیه؟', "یکم فروردین " . $n($jyNow + 1) . " برابر با {$nowruzL['weekday']} {$nowruzL['gregorian']} است."]
    : ['When is the next Nowruz?', '1 Farvardin ' . ($jyNow + 1) . " is {$nowruzL['weekday']}, {$nowruzL['gregorian']}."];

$main = '<p class="yc-lead">' . ($fa
        ? 'تاریخ شمسی رو به میلادی و قمری تبدیل کن، یا برعکس. روز هفته، فاصله تا امروز و مناسبت‌های اون روز هم نشون داده می‌شه.'
        : 'Convert a Persian (Solar Hijri) date to Gregorian and Lunar Hijri, or the other way round, with the weekday, how far it is from today and that day\'s occasions.') . '</p>'
    . '<p class="conv-today">' . ($fa ? 'امروز: ' : 'Today: ') . '<b>' . tj_h($today['weekday'] . ' ' . $today['jalali']) . '</b> = ' . tj_h($today['gregorian']) . ' = ' . tj_h($today['hijri']) . '</p>'
    . $result . '<div class="conv-forms">' . $forms . '</div>';

tj_render_page([
    'lang' => $lang, 'path' => "/$lang/convert/", 'alt' => ['fa' => '/fa/convert/', 'en' => '/en/convert/'],
    'title' => $fa ? 'تبدیل تاریخ شمسی به میلادی و قمری (و برعکس) | توجیبی' : 'Persian Date Converter: Solar Hijri, Gregorian and Hijri | Toojibee',
    'desc' => $fa ? "تبدیل تاریخ شمسی به میلادی، میلادی به شمسی و قمری، آنلاین و دقیق؛ با روز هفته و مناسبت‌ها. امروز {$today['jalali']} برابر با {$today['gregorian']}."
        : "Convert Persian (Solar Hijri) dates to Gregorian and Hijri and back, online, with the weekday and occasions. Today is {$today['jalali']} = {$today['gregorian']}.",
    'h1' => $fa ? 'تبدیل تاریخ شمسی، میلادی و قمری' : 'Persian date converter',
    'main' => $main, 'faq' => $faq, 'class' => 'conv-page',
]);
