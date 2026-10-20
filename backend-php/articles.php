<?php
/* Public article pages on the live host:
 *   /fa/articles/          list of published articles (also /en/)
 *   /fa/articles/<slug>/   one article
 * Built from the site's own About page (fa|en/about/index.html), so the
 * header, footer, fonts and theme are exactly the marketing site's; only
 * <main> and the page's meta tags are swapped. No extra requests, no
 * scripts beyond the site's theme toggle. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/content.php';
require __DIR__ . '/lib/articles.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/dates.php'; // tj_jalali

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$slug = strtolower((string)($_GET['slug'] ?? ''));
$fa = $lang === 'fa';
$T = $fa
    ? ['list' => 'مقاله‌ها', 'list_desc' => 'نوشته‌های توجیبی درباره‌ی برنامه‌ریزی، عادت‌ها و مدیریت زمان.', 'empty' => 'هنوز مقاله‌ای منتشر نشده.', 'back' => 'همه‌ی مقاله‌ها', 'site' => 'توجیبی', 'read' => 'خواندن']
    : ['list' => 'Articles', 'list_desc' => 'Toojibee writing on planning, habits and managing your time.', 'empty' => 'No articles yet.', 'back' => 'All articles', 'site' => 'Toojibee', 'read' => 'Read'];

function tj_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function tj_article_date(?string $utc, bool $fa): string {
    if (!$utc) return '';
    $d = new DateTime($utc, new DateTimeZone('UTC'));
    $d->setTimezone(new DateTimeZone('Asia/Tehran'));
    if (!$fa) return $d->format('F j, Y');
    [$y, $m, $day] = tj_jalali((int)$d->format('Y'), (int)$d->format('n'), (int)$d->format('j'));
    return tj_fa_digits("$day " . TJ_JALALI_MONTHS[$m - 1] . " $y");
}

function tj_not_found(): void {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile(dirname(__DIR__) . '/404.html');
    exit;
}

$tpl = (string)@file_get_contents(dirname(__DIR__) . "/$lang/about/index.html");
if ($tpl === '') tj_not_found();
$tpl = str_replace('../../', '/', $tpl); // pages live at different depths here

try {
    if ($slug === '') {
        $list = tj_articles_in($lang, 'list'); // only those ticked "articles page"
        $path = "/$lang/articles/";
        $title = $T['list'] . ' — ' . $T['site'];
        $desc = $T['list_desc'];
        $cards = '';
        foreach ($list as $a) {
            $cards .= '<a class="article-card" href="/' . $lang . '/articles/' . tj_h($a['slug']) . '/">'
                . ($a['cover'] ? '<img src="' . tj_h($a['cover']) . '" alt="" loading="lazy" width="1600" height="900">' : '')
                . '<span class="article-card-body"><h2>' . tj_h($a['title']) . '</h2>'
                . ($a['summary'] !== '' ? '<p>' . tj_h($a['summary']) . '</p>' : '')
                . '<span class="article-date">' . tj_h(tj_article_date($a['published_at'], $fa)) . '</span></span></a>';
        }
        $main = '<section class="content-page articles"><h1>' . tj_h($T['list']) . '</h1>'
            . ($cards !== '' ? '<div class="article-list">' . $cards . '</div>' : '<p>' . tj_h($T['empty']) . '</p>')
            . '</section>';
        $other = '/' . ($fa ? 'en' : 'fa') . '/articles/';
    } else {
        if (!preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $slug)) tj_not_found();
        $a = tj_published_article($lang, $slug);
        if (!$a) tj_not_found();
        $path = "/$lang/articles/{$a['slug']}/";
        $title = $a['title'] . ' — ' . $T['site'];
        $plain = trim((string)preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(tj_article_html($a['body'])), ENT_QUOTES, 'UTF-8')));
        $desc = $a['summary'] !== '' ? $a['summary'] : (function_exists('mb_substr') ? mb_substr($plain, 0, 160) : substr($plain, 0, 160));
        $main = '<article class="content-page article">'
            . '<a class="article-back" href="/' . $lang . '/articles/">' . tj_h($T['back']) . '</a>'
            . '<h1>' . tj_h($a['title']) . '</h1>'
            . '<p class="article-date">' . tj_h(tj_article_date($a['published_at'], $fa)) . '</p>'
            . ($a['cover'] ? '<img class="article-cover" src="' . tj_h($a['cover']) . '" alt="" width="1600" height="900">' : '')
            . '<div class="article-body">' . tj_article_html($a['body']) . '</div>'
            . '</article>';
        $other = '/' . ($fa ? 'en' : 'fa') . '/articles/';
    }
} catch (Throwable $e) {
    error_log('[toojibee-articles] ' . $e->getMessage());
    tj_not_found();
}

// Callbacks, not replacement strings: a title with "$1" or "\" in it
// must come out literally.
$put = function (string $html, string $re, string $value, int $limit = -1): string {
    return preg_replace_callback($re, function ($m) use ($value) { return $m[1] . $value . ($m[2] ?? ''); }, $html, $limit);
};
$url = 'https://toojibee.ir' . $path;
$html = $tpl;
$html = $put($html, '#(<title>).*?(</title>)#s', tj_h($title), 1);
$html = $put($html, '#(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*(")#', tj_h($desc));
$html = $put($html, '#(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*(")#', tj_h($title));
$html = $put($html, '#(<link rel="canonical" href=")[^"]*(")#', $url);
$html = $put($html, '#(<meta property="og:url" content=")[^"]*(")#', $url);
$html = preg_replace('#<link rel="alternate" hreflang="[^"]+" href="[^"]*">\s*#', '', $html);
$html = $put($html, '#(<a class="lang-switch" href=")[^"]*(")#', $other);
$html = $put($html, '#(<main id="main">).*?(</main>)#s', $main, 1);
$html = tj_footer_with_articles($html, $lang);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
