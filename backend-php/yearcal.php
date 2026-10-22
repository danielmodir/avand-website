<?php
/* "Calendar <year>" page on the live host: /fa/calendar/ (this Solar Hijri
 * year) and /fa/calendar/1405/ (a given year: last, this or next), and the
 * same under /en/. All twelve months as grids (Saturday first), official
 * holidays marked, every month's occasions listed, Hijri and Gregorian
 * month ranges — worked out on the server (Tehran's date), so the page is
 * complete for search engines with no script. Built from the site's About
 * page like today.php, so header, footer, fonts and theme match. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/dates.php';
require __DIR__ . '/lib/articles.php';

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$fa = $lang === 'fa';
function tj_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
$n = function ($v) use ($fa): string { return $fa ? tj_fa_digits((string)$v) : (string)$v; };

$tpl = (string)@file_get_contents(dirname(__DIR__) . "/$lang/about/index.html");
if ($tpl === '') { http_response_code(500); exit; }
$tpl = str_replace('../../', '/', $tpl);

$now = new DateTime('now', new DateTimeZone('Asia/Tehran'));
[$thisYear, $todayM, $todayD] = tj_jalali((int)$now->format('Y'), (int)$now->format('n'), (int)$now->format('j'));
$year = isset($_GET['year']) && $_GET['year'] !== '' ? (int)$_GET['year'] : $thisYear;
if ($year < $thisYear - 1 || $year > $thisYear + 1) { http_response_code(404); readfile(dirname(__DIR__) . '/404.html'); exit; }
$isCurrent = $year === $thisYear;

$weekdaysFa = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];          // Saturday first
$weekdaysEn = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
$monthsFa = TJ_JALALI_MONTHS; $monthsEn = TJ_JALALI_MONTHS_EN;

try {
    // 1 Farvardin of $year falls on 19–22 March of $year + 621.
    $d = null;
    foreach ([19, 20, 21, 22, 18, 23] as $md) {
        [$jy, $jm, $jd] = tj_jalali($year + 621, 3, $md);
        if ($jy === $year && $jm === 1 && $jd === 1) { $d = new DateTime(sprintf('%04d-03-%02d', $year + 621, $md), new DateTimeZone('Asia/Tehran')); break; }
    }
    if (!$d) throw new RuntimeException('no Nowruz for ' . $year);

    $months = array_fill(1, 12, ['days' => [], 'occ' => [], 'first' => null, 'last' => null]);
    $holidays = 0; $holidayList = [];
    for ($i = 0; $i < 367; $i++, $d->modify('+1 day')) {
        $gy = (int)$d->format('Y'); $gm = (int)$d->format('n'); $gd = (int)$d->format('j');
        [$jy, $jm, $jd] = tj_jalali($gy, $gm, $gd);
        if ($jy !== $year) break;
        [$hy, $hm, $hd] = tj_hijri($gy, $gm, $gd);
        $occ = tj_occasions_on($gy, $gm, $gd);
        $off = array_values(array_filter($occ, function ($o) { return $o['holiday']; }));
        $friday = (int)$d->format('w') === 5;
        $col = ((int)$d->format('w') + 1) % 7;
        $months[$jm]['days'][] = ['d' => $jd, 'col' => $col, 'off' => $friday || $off, 'holiday' => (bool)$off,
            'today' => $isCurrent && $jm === $todayM && $jd === $todayD, 'title' => implode(' · ', array_map(function ($o) { return $o['title']; }, $occ))];
        foreach ($occ as $o) $months[$jm]['occ'][] = [$jd, $o['title'], $o['holiday']];
        if ($off) { $holidays++; $holidayList[] = [$jm, $jd, $off[0]['title']]; }
        $hijriLabel = $fa ? TJ_HIJRI_MONTHS[$hm - 1] . ' ' . $hy : TJ_HIJRI_MONTHS_EN[$hm - 1] . ' ' . $hy;
        $gLabel = $d->format('F Y');
        if ($months[$jm]['first'] === null) $months[$jm]['first'] = [$hijriLabel, $gLabel];
        $months[$jm]['last'] = [$hijriLabel, $gLabel];
    }

    $wd = $fa ? $weekdaysFa : $weekdaysEn;
    $grids = '';
    foreach ($months as $m => $info) {
        $name = ($fa ? $monthsFa[$m - 1] : $monthsEn[$m - 1]) . ' ' . $n($year);
        $cells = '';
        $lead = $info['days'] ? $info['days'][0]['col'] : 0;
        for ($k = 0; $k < $lead; $k++) $cells .= '<span class="yc-day empty"></span>';
        foreach ($info['days'] as $x) {
            $cls = 'yc-day' . ($x['off'] ? ' off' : '') . ($x['today'] ? ' today' : '');
            $cells .= '<span class="' . $cls . '"' . ($x['title'] !== '' ? ' title="' . tj_h($x['title']) . '"' : '') . '>' . $n($x['d']) . '</span>';
        }
        $range = $info['first'] ? (($info['first'][0] === $info['last'][0] ? $info['first'][0] : $info['first'][0] . ' – ' . $info['last'][0])
            . ' · ' . ($info['first'][1] === $info['last'][1] ? $info['first'][1] : $info['first'][1] . ' – ' . $info['last'][1])) : '';
        $occList = '';
        foreach ($info['occ'] as $o) {
            $occList .= '<li' . ($o[2] ? ' class="holiday"' : '') . '><b>' . $n($o[0]) . ' ' . tj_h($fa ? $monthsFa[$m - 1] : $monthsEn[$m - 1]) . '</b> — ' . tj_h($o[1])
                . ($o[2] ? ' <span class="today-tag">' . ($fa ? 'تعطیل' : 'holiday') . '</span>' : '') . '</li>';
        }
        $grids .= '<section class="yc-month" id="m' . $m . '"><h2>' . tj_h($name) . '</h2>'
            . '<p class="yc-range">' . $n(tj_h($range)) . '</p>'
            . '<div class="yc-grid" role="grid" aria-label="' . tj_h($name) . '">'
            . implode('', array_map(function ($w) { return '<span class="yc-wd">' . $w . '</span>'; }, $wd)) . $cells . '</div>'
            . ($occList !== '' ? '<ul class="today-occasions yc-occ">' . $occList . '</ul>' : '') . '</section>';
    }

    $jump = '<nav class="yc-jump" aria-label="' . ($fa ? 'ماه‌ها' : 'Months') . '">' . implode('', array_map(function ($m) use ($fa, $monthsFa, $monthsEn) {
        return '<a href="#m' . $m . '">' . tj_h($fa ? $monthsFa[$m - 1] : $monthsEn[$m - 1]) . '</a>';
    }, range(1, 12))) . '</nav>';
    $years = '<p class="yc-years">' . implode(' · ', array_map(function ($y) use ($lang, $n, $year, $thisYear) {
        $href = $y === $thisYear ? "/$lang/calendar/" : "/$lang/calendar/$y/";
        return $y === $year ? '<b>' . $n($y) . '</b>' : '<a href="' . $href . '">' . $n($y) . '</a>';
    }, [$thisYear - 1, $thisYear, $thisYear + 1])) . '</p>';

    $holidayHtml = '<ul class="today-occasions">' . implode('', array_map(function ($h) use ($fa, $n, $monthsFa, $monthsEn) {
        return '<li class="holiday"><b>' . $n($h[1]) . ' ' . tj_h($fa ? $monthsFa[$h[0] - 1] : $monthsEn[$h[0] - 1]) . '</b> — ' . tj_h($h[2]) . '</li>';
    }, $holidayList)) . '</ul>';

    $Y = $n($year); $HN = $n($holidays);
    $faq = $fa ? [
        ["تعطیلات رسمی سال {$Y} چند روزه؟", "در تقویم رسمی سال {$Y}، {$HN} روز تعطیل رسمی (غیر از جمعه‌ها) هست که فهرستشون در همین صفحه آمده."],
        ["سال {$Y} از چه روزی شروع می‌شه؟", "سال {$Y} با نوروز، یکم فروردین، شروع می‌شه و تا آخر اسفند ادامه داره."],
        ['تاریخ‌های قمری این تقویم از کجا میاد؟', 'تاریخ‌های قمری بر اساس تقویم رسمی کشور (مرکز تقویم مؤسسه ژئوفیزیک دانشگاه تهران) است و ممکنه بعد از رؤیت هلال یک روز جابه‌جا بشه.'],
    ] : [
        ["How many official holidays are there in Iran in {$year}?", "The official calendar for {$year} (Solar Hijri) has {$holidays} official holidays besides Fridays; they're all listed on this page."],
        ["When does the year {$year} start?", "The Solar Hijri year {$year} starts at Nowruz, 1 Farvardin, and runs to the end of Esfand."],
        ['Where do the Hijri dates come from?', "Hijri dates follow Iran's official calendar (Calendar Center, University of Tehran Institute of Geophysics) and may move by a day after the new moon is sighted."],
    ];
    $faqHtml = '<dl class="today-faq">' . implode('', array_map(function ($q) { return '<dt>' . tj_h($q[0]) . '</dt><dd>' . tj_h($q[1]) . '</dd>'; }, $faq)) . '</dl>';

    $h1 = $fa ? "تقویم {$Y} با مناسبت‌ها و تعطیلات رسمی" : "Persian calendar {$year} with holidays and occasions";
    $lead = $fa
        ? "تقویم کامل سال {$Y} خورشیدی (شمسی) با تاریخ‌های قمری و میلادی هر ماه، همه‌ی مناسبت‌ها و {$HN} تعطیل رسمی. روزهای تعطیل رنگی‌ان؛ برای دیدن مناسبت هر روز، فهرست زیر هر ماه رو ببین."
        : "The full Solar Hijri year {$year}, with each month's Hijri and Gregorian dates, every occasion and the {$holidays} official holidays. Days off are highlighted; each month's occasions are listed under it.";
    $main = '<section class="content-page today-page yc-page">'
        . '<h1>' . tj_h($h1) . '</h1>'
        . '<p class="yc-lead">' . tj_h($lead) . '</p>'
        . $years . $jump
        . '<div class="yc-months">' . $grids . '</div>'
        . '<h2>' . ($fa ? "تعطیلات رسمی {$Y}" : "Official holidays {$year}") . '</h2>' . $holidayHtml
        . '<h2>' . ($fa ? 'پرسش‌های رایج' : 'Common questions') . '</h2>' . $faqHtml
        . '<p class="today-cta"><a class="btn btn-primary" href="/' . $lang . '/today/">' . ($fa ? 'تاریخ امروز' : "Today's date") . '</a> '
        . '<a class="btn btn-ghost" href="/demo/">' . ($fa ? 'برنامه‌ریزی روزهات با توجیبی' : 'Plan your days in Toojibee') . '</a></p>'
        . '<p class="today-note">' . ($fa ? 'تاریخ‌ها به وقت تهران و طبق تقویم رسمی کشور است.' : "Dates are in Tehran time and follow Iran's official calendar.") . '</p>'
        . '</section>';

    $title = $fa ? "تقویم {$Y} با مناسبت‌ها و تعطیلات رسمی | توجیبی" : "Persian Calendar {$year} with Holidays | Toojibee";
    $desc = $fa
        ? "تقویم کامل {$Y} شمسی با تاریخ قمری و میلادی، همه‌ی مناسبت‌ها و {$HN} تعطیل رسمی سال؛ ماه‌به‌ماه، از فروردین تا اسفند."
        : "The full Persian (Solar Hijri) calendar {$year} with Hijri and Gregorian dates, every occasion and all {$holidays} official holidays, month by month.";
} catch (Throwable $e) {
    error_log('[toojibee-yearcal] ' . $e->getMessage());
    http_response_code(500);
    exit;
}

$path = $isCurrent ? "/$lang/calendar/" : "/$lang/calendar/$year/";
$url = 'https://toojibee.ir' . $path;
$other = $fa ? 'en' : 'fa';
$ld = json_encode([
    '@context' => 'https://schema.org',
    '@graph' => [
        ['@type' => 'WebPage', 'name' => $title, 'url' => $url, 'inLanguage' => $lang, 'description' => $desc,
         'dateModified' => $now->format('c'), 'isPartOf' => ['@type' => 'WebSite', 'name' => $fa ? 'توجیبی' : 'Toojibee', 'url' => 'https://toojibee.ir/']],
        ['@type' => 'BreadcrumbList', 'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => $fa ? 'توجیبی' : 'Toojibee', 'item' => "https://toojibee.ir/$lang/"],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $h1, 'item' => $url]]],
        ['@type' => 'FAQPage', 'mainEntity' => array_map(function ($q) {
            return ['@type' => 'Question', 'name' => $q[0], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $q[1]]];
        }, $faq)],
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
$html = preg_replace('#<script type="application/ld\+json">.*?</script>\s*#s', '', $html);
$alt = function ($l) use ($isCurrent, $year) { return "https://toojibee.ir/$l/calendar/" . ($isCurrent ? '' : "$year/"); };
$html = str_replace('</head>', '<link rel="alternate" hreflang="fa" href="' . $alt('fa') . '"><link rel="alternate" hreflang="en" href="' . $alt('en') . '"><link rel="alternate" hreflang="x-default" href="' . $alt('fa') . '">'
    . '<script type="application/ld+json">' . $ld . '</script></head>', $html);
$html = $put($html, '#(<a class="lang-switch" href=")[^"]*(")#', "/$other/calendar/" . ($isCurrent ? '' : "$year/"));
$html = $put($html, '#(<main id="main">).*?(</main>)#s', $main, 1);
$html = tj_footer_with_articles($html, $lang);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
