<?php
/* /sitemap.xml on the live host: the static sitemap.xml (the fixed pages)
 * plus the pages the server makes — "today's date" (changes daily) and
 * every published article. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/content.php';
require __DIR__ . '/lib/articles.php';

$xml = (string)@file_get_contents(dirname(__DIR__) . '/sitemap.xml');
if ($xml === '') { http_response_code(500); exit; }

$base = 'https://toojibee.ir';
$e = function (string $s): string { return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); };
$pair = function (string $fa, string $en) use ($base, $e): string {
    return '    <xhtml:link rel="alternate" hreflang="en" href="' . $e($base . $en) . '"/>' . "\n"
         . '    <xhtml:link rel="alternate" hreflang="fa" href="' . $e($base . $fa) . '"/>' . "\n";
};

$today = (new DateTime('now', new DateTimeZone('Asia/Tehran')))->format('Y-m-d');
$extra = '';
foreach (['fa', 'en'] as $l) {
    $extra .= "  <url>\n    <loc>$base/$l/today/</loc>\n    <lastmod>$today</lastmod>\n    <changefreq>daily</changefreq>\n"
        . $pair('/fa/today/', '/en/today/') . "  </url>\n";
    // The year calendar (yearcal.php): this year, and the next one too
    // (searched from autumn on).
    $extra .= "  <url>\n    <loc>$base/$l/calendar/</loc>\n    <lastmod>$today</lastmod>\n    <changefreq>weekly</changefreq>\n"
        . $pair('/fa/calendar/', '/en/calendar/') . "  </url>\n";
}
require_once __DIR__ . '/lib/dates.php';
[$jyNow] = tj_jalali((int)date('Y'), (int)date('n'), (int)date('j'));
foreach (['fa', 'en'] as $l) {
    $y = $jyNow + 1;
    $extra .= "  <url>\n    <loc>$base/$l/calendar/$y/</loc>\n" . $pair("/fa/calendar/$y/", "/en/calendar/$y/") . "  </url>\n";
}
try {
    foreach (['fa', 'en'] as $l) {
        if (tj_articles_in($l, 'list', 1)) $extra .= "  <url>\n    <loc>$base/$l/articles/</loc>\n  </url>\n";
        foreach (tj_published_articles($l) as $a) { // every article has its own page
            $mod = $a['updated_at'] ?? $a['published_at'] ?? '';
            $extra .= '  <url>' . "\n" . '    <loc>' . $e("$base/$l/articles/{$a['slug']}/") . "</loc>\n"
                . ($mod ? '    <lastmod>' . substr((string)$mod, 0, 10) . "</lastmod>\n" : '') . "  </url>\n";
        }
    }
} catch (Throwable $ex) {
    error_log('[toojibee-sitemap] ' . $ex->getMessage());
}

header('Content-Type: application/xml; charset=utf-8');
echo str_replace('</urlset>', $extra . '</urlset>', $xml);
