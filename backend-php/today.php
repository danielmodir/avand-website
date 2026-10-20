<?php
/* "Today's date" page on the live host: /fa/today/ and /en/today/.
 * Today in Solar Hijri (Jalali), Hijri (Iran's official month starts) and
 * Gregorian, whether it's a holiday, today's occasions and the coming
 * week — worked out on the server for Tehran's date, so the page is right
 * on every visit and to search engines (no script needed). Built from the
 * site's About page like the article pages, so header, footer, fonts and
 * theme match the rest of the site. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/dates.php';
require __DIR__ . '/lib/articles.php';

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$fa = $lang === 'fa';
function tj_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

$tpl = (string)@file_get_contents(dirname(__DIR__) . "/$lang/about/index.html");
if ($tpl === '') { http_response_code(500); exit; }
$tpl = str_replace('../../', '/', $tpl);

$now = new DateTime('now', new DateTimeZone('Asia/Tehran'));
$weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* All three dates for a day as display strings. */
$describe = function (DateTime $d) use ($fa, $weekdaysEn): array {
    $gy = (int)$d->format('Y'); $gm = (int)$d->format('n'); $gd = (int)$d->format('j'); $w = (int)$d->format('w');
    [$jy, $jm, $jd] = tj_jalali($gy, $gm, $gd);
    [$hy, $hm, $hd] = tj_hijri($gy, $gm, $gd);
    return [
        'weekday' => $fa ? TJ_WEEKDAYS_FA[$w] : $weekdaysEn[$w],
        'jalali' => $fa ? tj_fa_digits("$jd " . TJ_JALALI_MONTHS[$jm - 1] . " $jy") : "$jd " . TJ_JALALI_MONTHS_EN[$jm - 1] . " $jy",
        'hijri' => $fa ? tj_fa_digits("$hd " . TJ_HIJRI_MONTHS[$hm - 1] . " $hy") : "$hd " . TJ_HIJRI_MONTHS_EN[$hm - 1] . " $hy",
        'gregorian' => $d->format('j F Y'),
        'jy' => $jy, 'friday' => $w === 5,
        'occasions' => tj_occasions_on($gy, $gm, $gd),
    ];
};

try {
    $today = $describe($now);
    $holiday = $today['friday'] || array_filter($today['occasions'], function ($o) { return $o['holiday']; });

    // Days until Nowruz (1 Farvardin of next year).
    $daysToNowruz = 0;
    for ($i = 1, $d = clone $now; $i <= 366; $i++) {
        $d->modify('+1 day');
        [, $m1, $d1] = tj_jalali((int)$d->format('Y'), (int)$d->format('n'), (int)$d->format('j'));
        if ($m1 === 1 && $d1 === 1) { $daysToNowruz = $i; break; }
    }

    $occ = function (array $list) use ($fa): string {
        if (!$list) return '<p class="today-none">' . ($fa ? 'مناسبت ثبت‌شده‌ای نداره.' : 'No listed occasions.') . '</p>';
        return '<ul class="today-occasions">' . implode('', array_map(function ($o) use ($fa) {
            return '<li' . ($o['holiday'] ? ' class="holiday"' : '') . '>' . tj_h($o['title']) . ($o['holiday'] ? ' <span class="today-tag">' . ($fa ? 'تعطیل' : 'holiday') . '</span>' : '') . '</li>';
        }, $list)) . '</ul>';
    };

    $week = '';
    for ($i = 1, $d = clone $now; $i <= 7; $i++) {
        $d->modify('+1 day');
        $x = $describe($d);
        $off = $x['friday'] || array_filter($x['occasions'], function ($o) { return $o['holiday']; });
        $week .= '<li class="today-day' . ($off ? ' off' : '') . '"><div class="today-day-head"><b>' . tj_h($x['weekday']) . ' ' . tj_h($x['jalali']) . '</b>'
            . '<span>' . tj_h($x['hijri']) . ' · <span dir="ltr">' . tj_h($x['gregorian']) . '</span></span></div>'
            . ($x['occasions'] ? $occ($x['occasions']) : '') . '</li>';
    }

    $T = $fa
        ? ['h1' => 'تاریخ امروز', 'solar' => 'خورشیدی (شمسی)', 'lunar' => 'قمری', 'greg' => 'میلادی', 'occ' => 'مناسبت‌های امروز', 'week' => 'هفت روز آینده',
           'off' => 'امروز تعطیل رسمیه.', 'on' => 'امروز تعطیل رسمی نیست.', 'cta' => 'دیدن تقویم کامل و برنامه‌ریزی روزت در توجیبی',
           'nowruz' => tj_fa_digits((string)$daysToNowruz) . ' روز تا نوروز ' . tj_fa_digits((string)($today['jy'] + 1)),
           'note' => 'تاریخ قمری بر اساس تقویم رسمی کشور (مرکز تقویم مؤسسه ژئوفیزیک) و به وقت تهران است.']
        : ['h1' => "Today's date in Iran", 'solar' => 'Solar Hijri (Persian)', 'lunar' => 'Hijri (lunar)', 'greg' => 'Gregorian', 'occ' => "Today's occasions", 'week' => 'The next seven days',
           'off' => 'Today is an official holiday in Iran.', 'on' => 'Today is not an official holiday in Iran.', 'cta' => 'See the full calendar and plan your day in Toojibee',
           'nowruz' => $daysToNowruz . ' days to Nowruz ' . ($today['jy'] + 1),
           'note' => "Hijri dates follow Iran's official calendar (Calendar Center, University of Tehran Institute of Geophysics), Tehran time."];

    $main = '<section class="content-page today-page">'
        . '<h1>' . $T['h1'] . '</h1>'
        . '<p class="today-weekday">' . tj_h($today['weekday']) . '</p>'
        . '<div class="today-grid">'
        . '<div class="today-card main"><span>' . $T['solar'] . '</span><b>' . tj_h($today['jalali']) . '</b></div>'
        . '<div class="today-card"><span>' . $T['lunar'] . '</span><b>' . tj_h($today['hijri']) . '</b></div>'
        . '<div class="today-card"><span>' . $T['greg'] . '</span><b dir="ltr">' . tj_h($today['gregorian']) . '</b></div>'
        . '</div>'
        . '<p class="today-status' . ($holiday ? ' off' : '') . '">' . ($holiday ? $T['off'] : $T['on']) . ' · ' . tj_h($T['nowruz']) . '</p>'
        . '<h2>' . $T['occ'] . '</h2>' . $occ($today['occasions'])
        . '<h2>' . $T['week'] . '</h2><ul class="today-week">' . $week . '</ul>'
        . '<p class="today-cta"><a class="btn btn-primary" href="/demo/">' . $T['cta'] . '</a></p>'
        . '<p class="today-note">' . $T['note'] . '</p>'
        . '</section>';

    $title = $fa
        ? "تاریخ امروز {$today['weekday']} {$today['jalali']} | تقویم شمسی، قمری و میلادی — توجیبی"
        : "Today's date: {$today['weekday']} {$today['jalali']} ({$today['gregorian']}) — Toojibee";
    $desc = $fa
        ? "تاریخ امروز {$today['weekday']} {$today['jalali']} برابر با {$today['hijri']} و {$today['gregorian']}؛ مناسبت‌ها و تعطیلات امروز و هفت روز آینده در تقویم توجیبی."
        : "Today in Iran is {$today['weekday']} {$today['jalali']} (Solar Hijri), {$today['hijri']} (Hijri) and {$today['gregorian']}: today's occasions, holidays and the week ahead.";
} catch (Throwable $e) {
    error_log('[toojibee-today] ' . $e->getMessage());
    http_response_code(500);
    exit;
}

$path = "/$lang/today/";
$url = 'https://toojibee.ir' . $path;
$ld = json_encode([
    '@context' => 'https://schema.org',
    '@graph' => [
        ['@type' => 'WebPage', 'name' => $title, 'url' => $url, 'inLanguage' => $lang, 'description' => $desc,
         'dateModified' => $now->format('c'), 'isPartOf' => ['@type' => 'WebSite', 'name' => $fa ? 'توجیبی' : 'Toojibee', 'url' => 'https://toojibee.ir/']],
        ['@type' => 'BreadcrumbList', 'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => $fa ? 'توجیبی' : 'Toojibee', 'item' => "https://toojibee.ir/$lang/"],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $T['h1'], 'item' => $url]]],
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$put = function (string $html, string $re, string $value, int $limit = -1): string {
    return preg_replace_callback($re, function ($m) use ($value) { return $m[1] . $value . ($m[2] ?? ''); }, $html, $limit);
};
$html = $tpl;
$html = $put($html, '#(<title>).*?(</title>)#s', tj_h($title), 1);
$html = $put($html, '#(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*(")#', tj_h($desc));
$html = $put($html, '#(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*(")#', tj_h($title));
$html = $put($html, '#(<link rel="canonical" href=")[^"]*(")#', $url);
$html = $put($html, '#(<meta property="og:url" content=")[^"]*(")#', $url);
$html = preg_replace('#<link rel="alternate" hreflang="[^"]+" href="[^"]*">\s*#', '', $html);
$html = str_replace('</head>', '<link rel="alternate" hreflang="fa" href="https://toojibee.ir/fa/today/"><link rel="alternate" hreflang="en" href="https://toojibee.ir/en/today/">'
    . '<script type="application/ld+json">' . $ld . '</script></head>', $html);
$html = $put($html, '#(<a class="lang-switch" href=")[^"]*(")#', '/' . ($fa ? 'en' : 'fa') . '/today/');
$html = $put($html, '#(<main id="main">).*?(</main>)#s', $main, 1);
$html = tj_footer_with_articles($html, $lang);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
