<?php
/* World clock and time difference (/fa/world-clock/, /en/world-clock/):
 * the time now in major cities and how far each is from Tehran (with
 * daylight saving as it is today), plus a "what time is it there when it
 * is … here" form. Worked out on the server with PHP's time zone data; a
 * few lines of script only keep the clocks ticking (Intl, no request). */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/dates.php';
require __DIR__ . '/lib/articles.php';
require __DIR__ . '/lib/page.php';

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$fa = $lang === 'fa';
$n = function ($v) use ($fa): string { return $fa ? tj_fa_digits((string)$v) : (string)$v; };

/* key => [time zone, Persian name, English name] */
const TJ_CITIES = [
    'tehran' => ['Asia/Tehran', 'تهران', 'Tehran'], 'kabul' => ['Asia/Kabul', 'کابل', 'Kabul'], 'dushanbe' => ['Asia/Dushanbe', 'دوشنبه', 'Dushanbe'],
    'dubai' => ['Asia/Dubai', 'دبی', 'Dubai'], 'baghdad' => ['Asia/Baghdad', 'بغداد', 'Baghdad'], 'riyadh' => ['Asia/Riyadh', 'ریاض', 'Riyadh'],
    'istanbul' => ['Europe/Istanbul', 'استانبول', 'Istanbul'], 'baku' => ['Asia/Baku', 'باکو', 'Baku'], 'yerevan' => ['Asia/Yerevan', 'ایروان', 'Yerevan'],
    'moscow' => ['Europe/Moscow', 'مسکو', 'Moscow'], 'london' => ['Europe/London', 'لندن', 'London'], 'paris' => ['Europe/Paris', 'پاریس', 'Paris'],
    'berlin' => ['Europe/Berlin', 'برلین', 'Berlin'], 'stockholm' => ['Europe/Stockholm', 'استکهلم', 'Stockholm'], 'delhi' => ['Asia/Kolkata', 'دهلی', 'Delhi'],
    'beijing' => ['Asia/Shanghai', 'پکن', 'Beijing'], 'kualalumpur' => ['Asia/Kuala_Lumpur', 'کوالالامپور', 'Kuala Lumpur'], 'tokyo' => ['Asia/Tokyo', 'توکیو', 'Tokyo'],
    'sydney' => ['Australia/Sydney', 'سیدنی', 'Sydney'], 'toronto' => ['America/Toronto', 'تورنتو', 'Toronto'], 'vancouver' => ['America/Vancouver', 'ونکوور', 'Vancouver'],
    'newyork' => ['America/New_York', 'نیویورک', 'New York'], 'losangeles' => ['America/Los_Angeles', 'لس‌آنجلس', 'Los Angeles'],
];

$name = function (string $k) use ($fa): string { return TJ_CITIES[$k][$fa ? 1 : 2]; };
$utc = new DateTime('now', new DateTimeZone('UTC'));
$tehranOff = (new DateTimeZone('Asia/Tehran'))->getOffset($utc);
$fmtDiff = function (int $sec) use ($fa, $n): string {
    if ($sec === 0) return $fa ? 'هم‌ساعت با تهران' : 'same as Tehran';
    $h = intdiv(abs($sec), 3600); $mi = intdiv(abs($sec) % 3600, 60);
    $t = $fa ? ($h ? $n($h) . ' ساعت' : '') . ($h && $mi ? ' و ' : '') . ($mi ? $n($mi) . ' دقیقه' : '') : ($h ? $h . 'h' : '') . ($mi ? ($h ? ' ' : '') . $mi . 'm' : '');
    return $fa ? $t . ($sec > 0 ? ' جلوتر از تهران' : ' عقب‌تر از تهران') : $t . ($sec > 0 ? ' ahead of Tehran' : ' behind Tehran');
};

$rows = '';
foreach (TJ_CITIES as $k => [$tz]) {
    $z = new DateTimeZone($tz);
    $local = (clone $utc)->setTimezone($z);
    $diff = $z->getOffset($utc) - $tehranOff;
    $rows .= '<tr><th scope="row">' . tj_h($name($k)) . '</th><td><time class="wc-time" data-tz="' . tj_h($tz) . '" dir="ltr">' . $n($local->format('H:i')) . '</time></td>'
        . '<td>' . tj_h($fmtDiff($diff)) . '</td></tr>';
}

// "When it's HH:MM in A, what time is it in B?"
$fromK = isset($_GET['from'], TJ_CITIES[$_GET['from']]) ? $_GET['from'] : 'tehran';
$toK = isset($_GET['to'], TJ_CITIES[$_GET['to']]) ? $_GET['to'] : 'london';
$time = preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', (string)($_GET['t'] ?? ''), $mt) ? sprintf('%02d:%02d', $mt[1], $mt[2]) : (clone $utc)->setTimezone(new DateTimeZone(TJ_CITIES[$fromK][0]))->format('H:i');
$src = new DateTime((clone $utc)->setTimezone(new DateTimeZone(TJ_CITIES[$fromK][0]))->format('Y-m-d') . ' ' . $time, new DateTimeZone(TJ_CITIES[$fromK][0]));
$dst = (clone $src)->setTimezone(new DateTimeZone(TJ_CITIES[$toK][0]));
$dayShift = (int)$dst->format('Ymd') <=> (int)$src->format('Ymd');
$opt = function (string $sel) use ($name): string {
    $o = '';
    foreach (array_keys(TJ_CITIES) as $k) $o .= '<option value="' . $k . '"' . ($k === $sel ? ' selected' : '') . '>' . tj_h($name($k)) . '</option>';
    return $o;
};
$conv = '<form class="conv-form" method="get" action="/' . $lang . '/world-clock/"><h2>' . ($fa ? 'محاسبه‌ی اختلاف ساعت' : 'Time difference calculator') . '</h2><div class="conv-row">'
    . '<label><span>' . ($fa ? 'ساعت' : 'Time') . '</span><input type="time" name="t" value="' . $time . '"></label>'
    . '<label><span>' . ($fa ? 'در' : 'in') . '</span><select name="from">' . $opt($fromK) . '</select></label>'
    . '<label><span>' . ($fa ? 'به وقت' : 'to') . '</span><select name="to">' . $opt($toK) . '</select></label>'
    . '<button class="btn btn-primary" type="submit">' . ($fa ? 'حساب کن' : 'Calculate') . '</button></div>'
    . '<p class="conv-weekday">' . ($fa
        ? 'وقتی در ' . tj_h($name($fromK)) . ' ساعت ' . $n($time) . ' است، در ' . tj_h($name($toK)) . ' ساعت <b dir="ltr">' . $n($dst->format('H:i')) . '</b>' . ($dayShift ? ($dayShift > 0 ? ' (فردا)' : ' (دیروز)') : '') . ' است.'
        : 'When it is ' . $time . ' in ' . tj_h($name($fromK)) . ', it is <b>' . $dst->format('H:i') . '</b>' . ($dayShift ? ($dayShift > 0 ? ' (next day)' : ' (previous day)') : '') . ' in ' . tj_h($name($toK)) . '.') . '</p></form>';

$tehranNow = (clone $utc)->setTimezone(new DateTimeZone('Asia/Tehran'));
$main = '<p class="yc-lead">' . ($fa
        ? 'ساعت الان شهرهای مهم دنیا و اختلاف ساعتشون با تهران (با ساعت تابستانی همون کشورها، اگه دارن). ساعت‌ها خودشون جلو می‌رن.'
        : 'The time now in major cities and their difference from Tehran (with each country\'s daylight saving, if it has one). The clocks keep running.') . '</p>'
    . '<p class="conv-today">' . ($fa ? 'ساعت تهران: ' : 'Tehran: ') . '<b><time class="wc-time" data-tz="Asia/Tehran" dir="ltr">' . $n($tehranNow->format('H:i')) . '</time></b></p>'
    . '<table class="wc-table"><thead><tr><th>' . ($fa ? 'شهر' : 'City') . '</th><th>' . ($fa ? 'ساعت' : 'Time') . '</th><th>' . ($fa ? 'اختلاف با تهران' : 'Difference from Tehran') . '</th></tr></thead><tbody>' . $rows . '</tbody></table>'
    . $conv;

$londonDiff = (new DateTimeZone('Europe/London'))->getOffset($utc) - $tehranOff;
$faq = $fa ? [
    ['اختلاف ساعت تهران و لندن چقدره؟', 'الان لندن ' . $fmtDiff($londonDiff) . ' است؛ با شروع یا پایان ساعت تابستانی اروپا یک ساعت تغییر می‌کنه.'],
    ['ایران ساعت تابستانی داره؟', 'نه؛ ایران از سال ۱۴۰۲ ساعت رسمی رو در تابستان جابه‌جا نمی‌کنه و همیشه ۳ ساعت و ۳۰ دقیقه جلوتر از ساعت جهانی (UTC+3:30) است.'],
    ['این ساعت‌ها از کجا میاد؟', 'از پایگاه داده‌ی منطقه‌های زمانی جهانی (IANA) که قانون ساعت تابستانی هر کشور رو هم داره؛ برای همین اختلاف‌ها در طول سال درست می‌مونه.'],
] : [
    ['What is the time difference between Tehran and London?', 'Right now London is ' . $fmtDiff($londonDiff) . '; it changes by an hour when Europe starts or ends daylight saving.'],
    ['Does Iran use daylight saving time?', 'No. Since 2023 (1402) Iran keeps the same time all year: 3 hours 30 minutes ahead of UTC (UTC+3:30).'],
    ['Where do these times come from?', "From the world time zone database (IANA), which includes each country's daylight saving rules, so the differences stay right all year."],
];

$script = '<script>(function(){var el=document.querySelectorAll(".wc-time[data-tz]");if(!el.length||!window.Intl)return;var fa=document.documentElement.lang==="fa";'
    . 'function tick(){var d=new Date();for(var i=0;i<el.length;i++){try{el[i].textContent=new Intl.DateTimeFormat(fa?"fa-IR":"en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:el[i].getAttribute("data-tz")}).format(d);}catch(e){}}}'
    . 'tick();setInterval(tick,15000);})();</script>';

tj_render_page([
    'lang' => $lang, 'path' => "/$lang/world-clock/", 'alt' => ['fa' => '/fa/world-clock/', 'en' => '/en/world-clock/'],
    'title' => $fa ? 'ساعت جهانی و اختلاف ساعت کشورها با ایران | توجیبی' : 'World Clock and Time Difference from Iran | Toojibee',
    'desc' => $fa ? 'ساعت الان تهران، دبی، استانبول، لندن، تورنتو، نیویورک و شهرهای دیگر، و اختلاف ساعت کشورها با ایران؛ با ماشین‌حساب اختلاف ساعت.'
        : 'The time now in Tehran, Dubai, Istanbul, London, Toronto, New York and more, and each one\'s difference from Iran, with a time zone converter.',
    'h1' => $fa ? 'ساعت جهانی و اختلاف ساعت با ایران' : 'World clock and time difference from Iran',
    'main' => $main, 'faq' => $faq, 'class' => 'wc-page', 'script' => $script,
]);
