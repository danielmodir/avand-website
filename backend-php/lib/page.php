<?php
/* Pages the server builds from the site's About page (header, footer,
 * fonts and theme match): the date converter, the world clock and the
 * month pages. Same recipe as today.php / yearcal.php: everything is in
 * the HTML (complete for search engines with no script), title, meta,
 * canonical, hreflang and JSON-LD (WebPage + breadcrumb + FAQ). */
declare(strict_types=1);

if (!function_exists('tj_h')) { function tj_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); } }

/* $o: lang, path (e.g. /fa/convert/), alt (lang => path), title, desc, h1,
 * main (inner HTML of <main>), faq ([[q, a], …]), crumbs ([[name, path], …]
 * after the home crumb), extraLd (more JSON-LD nodes). */
function tj_render_page(array $o): void {
    $lang = $o['lang']; $fa = $lang === 'fa';
    $tpl = (string)@file_get_contents(dirname(__DIR__, 2) . "/$lang/about/index.html");
    if ($tpl === '') { http_response_code(500); exit; }
    $tpl = str_replace('../../', '/', $tpl);
    $base = 'https://toojibee.ir';
    $url = $base . $o['path'];
    $site = $fa ? 'توجیبی' : 'Toojibee';
    $crumbs = [['@type' => 'ListItem', 'position' => 1, 'name' => $site, 'item' => "$base/$lang/"]];
    foreach (($o['crumbs'] ?? [[$o['h1'], $o['path']]]) as $i => [$name, $p]) {
        $crumbs[] = ['@type' => 'ListItem', 'position' => $i + 2, 'name' => $name, 'item' => $base . $p];
    }
    $graph = [
        ['@type' => 'WebPage', 'name' => $o['title'], 'url' => $url, 'inLanguage' => $lang, 'description' => $o['desc'],
         'isPartOf' => ['@type' => 'WebSite', 'name' => $site, 'url' => "$base/"]],
        ['@type' => 'BreadcrumbList', 'itemListElement' => $crumbs],
    ];
    if (!empty($o['faq'])) {
        $graph[] = ['@type' => 'FAQPage', 'mainEntity' => array_map(function ($q) {
            return ['@type' => 'Question', 'name' => $q[0], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $q[1]]];
        }, $o['faq'])];
    }
    foreach ($o['extraLd'] ?? [] as $n) $graph[] = $n;
    $ld = json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $faqHtml = empty($o['faq']) ? '' : '<h2>' . ($fa ? 'پرسش‌های رایج' : 'Common questions') . '</h2><dl class="today-faq">'
        . implode('', array_map(function ($q) { return '<dt>' . tj_h($q[0]) . '</dt><dd>' . tj_h($q[1]) . '</dd>'; }, $o['faq'])) . '</dl>';
    $main = '<section class="content-page today-page ' . tj_h($o['class'] ?? '') . '"><h1>' . tj_h($o['h1']) . '</h1>' . $o['main'] . $faqHtml
        . tj_tools_nav($lang, $o['path']) . '</section>';

    $put = function (string $html, string $re, string $value, int $limit = -1): string {
        return preg_replace_callback($re, function ($m) use ($value) { return $m[1] . $value . ($m[2] ?? ''); }, $html, $limit);
    };
    $html = $tpl;
    $html = $put($html, '#(<title>).*?(</title>)#s', tj_h($o['title']), 1);
    $html = $put($html, '#(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*(")#', tj_h($o['desc']));
    $html = $put($html, '#(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*(")#', tj_h($o['title']));
    $html = $put($html, '#(<link rel="canonical" href=")[^"]*(")#', $url);
    $html = $put($html, '#(<meta property="og:url" content=")[^"]*(")#', $url);
    $html = preg_replace('#<link rel="alternate" hreflang="[^"]+" href="[^"]*">\s*#', '', $html);
    $html = preg_replace('#<script type="application/ld\+json">.*?</script>\s*#s', '', $html);
    $alt = $o['alt'];
    $html = str_replace('</head>', '<link rel="alternate" hreflang="fa" href="' . $base . $alt['fa'] . '"><link rel="alternate" hreflang="en" href="' . $base . $alt['en']
        . '"><link rel="alternate" hreflang="x-default" href="' . $base . $alt['fa'] . '">'
        . '<script type="application/ld+json">' . $ld . '</script>' . ($o['head'] ?? '') . '</head>', $html);
    $html = $put($html, '#(<a class="lang-switch" href=")[^"]*(")#', $alt[$fa ? 'en' : 'fa']);
    $html = $put($html, '#(<main id="main">).*?(</main>)#s', $main, 1);
    if (function_exists('tj_footer_with_articles')) $html = tj_footer_with_articles($html, $lang);
    if (!empty($o['script'])) $html = str_replace('</body>', $o['script'] . '</body>', $html);

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    echo $html;
}

/* Links between the free tools, at the bottom of each (internal links
 * help people and search engines find the others). */
function tj_tools_nav(string $lang, string $here): string {
    $fa = $lang === 'fa';
    $items = [
        ["/$lang/today/", $fa ? 'تاریخ امروز' : "Today's date"],
        ["/$lang/calendar/", $fa ? 'تقویم سال' : 'Year calendar'],
        ["/$lang/calendar/months/", $fa ? 'ماه‌های سال شمسی' : 'Persian months'],
        ["/$lang/convert/", $fa ? 'تبدیل تاریخ' : 'Date converter'],
        ["/$lang/world-clock/", $fa ? 'ساعت جهانی' : 'World clock'],
    ];
    $links = '';
    foreach ($items as [$href, $label]) {
        $links .= $href === $here ? '<b>' . tj_h($label) . '</b>' : '<a href="' . $href . '">' . tj_h($label) . '</a>';
    }
    return '<nav class="tools-nav" aria-label="' . ($fa ? 'ابزارهای تقویم' : 'Calendar tools') . '">' . $links . '</nav>';
}

/* Jalali -> Gregorian [y, m, d], or null if that day doesn't exist. */
function tj_jalali_to_g(int $jy, int $jm, int $jd): ?array {
    if ($jm < 1 || $jm > 12 || $jd < 1 || $jd > ($jm <= 6 ? 31 : 30)) return null;
    $nowruz = null;
    foreach ([20, 21, 19, 22, 18, 23] as $md) {
        [$y, $m, $d] = tj_jalali($jy + 621, 3, $md);
        if ($y === $jy && $m === 1 && $d === 1) { $nowruz = tj_g2jdn($jy + 621, 3, $md); break; }
    }
    if ($nowruz === null) return null;
    $g = tj_jdn2g($nowruz + ($jm <= 6 ? ($jm - 1) * 31 : 186 + ($jm - 7) * 30) + $jd - 1);
    return tj_jalali($g[0], $g[1], $g[2]) === [$jy, $jm, $jd] ? $g : null; // 30 Esfand in a common year
}

/* Hijri (official months where known) -> Gregorian, or null. */
function tj_hijri_to_g(int $hy, int $hm, int $hd): ?array {
    if ($hm < 1 || $hm > 12 || $hd < 1 || $hd > 30) return null;
    $guess = tj_hijri_month_start_tabular($hy, $hm) + $hd - 1;
    foreach ([0, -1, 1, -2, 2, -3, 3] as $k) {
        $g = tj_jdn2g($guess + $k);
        if (tj_hijri($g[0], $g[1], $g[2]) === [$hy, $hm, $hd]) return $g;
    }
    return null;
}

const TJ_EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TJ_GREG_MONTHS_FA = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
const TJ_WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* One day in all three calendars, as text. */
function tj_day_labels(array $g, bool $fa): array {
    [$gy, $gm, $gd] = $g;
    [$jy, $jm, $jd] = tj_jalali($gy, $gm, $gd);
    [$hy, $hm, $hd] = tj_hijri($gy, $gm, $gd);
    $w = (int)(new DateTime(sprintf('%04d-%02d-%02d', $gy, $gm, $gd)))->format('w');
    $n = function ($v) use ($fa) { return $fa ? tj_fa_digits((string)$v) : (string)$v; };
    return [
        'weekday' => $fa ? TJ_WEEKDAYS_FA[$w] : TJ_WEEKDAYS_EN[$w], // both lists start on Sunday
        'jalali' => $n($jd) . ' ' . ($fa ? TJ_JALALI_MONTHS[$jm - 1] : TJ_JALALI_MONTHS_EN[$jm - 1]) . ' ' . $n($jy),
        'hijri' => $n($hd) . ' ' . ($fa ? TJ_HIJRI_MONTHS[$hm - 1] : TJ_HIJRI_MONTHS_EN[$hm - 1]) . ' ' . $n($hy),
        'gregorian' => $n($gd) . ' ' . ($fa ? TJ_GREG_MONTHS_FA[$gm - 1] : TJ_EN_MONTHS[$gm - 1]) . ' ' . $n($gy),
        'j' => [$jy, $jm, $jd], 'h' => [$hy, $hm, $hd], 'g' => [$gy, $gm, $gd],
    ];
}
