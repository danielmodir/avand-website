<?php
/* Articles: written in the admin panel, reviewed, then shown on the
 * site at /fa/articles/ and /en/articles/ (articles.php renders them).
 *
 * Workflow: draft -> (submit) pending -> (review) published | rejected.
 * - articles.write: create, edit and submit your own drafts/rejected ones.
 * - articles.review: see all, edit, approve/reject with a note, unpublish.
 *   An author can't approve their own article, except the owner (the
 *   only admin at first).
 * The body is plain text with a few marks (see tj_article_html): no HTML
 * from the writer ever reaches the page, everything is escaped first. */
declare(strict_types=1);

const TJ_ARTICLE_STATUSES = ['draft', 'pending', 'published', 'rejected'];
/* Where a published article shows up ("show in" in the panel):
 * list         the site's /fa|en/articles/ page
 * landing      a section on the landing page (page.php)
 * app_period   the app's period desk (the occasions and planning desks had
 *              articles too until 2026-10-21; removed at the owner's request)
 * Its own page (/articles/<slug>/) works whatever is ticked. */
const TJ_ARTICLE_PLACES = ['list', 'landing', 'app_period'];
const TJ_ARTICLE_PLACE_LIMIT = 6;
/* Topic, for the app's Articles page (Profile) filter. */
const TJ_ARTICLE_CATEGORIES = ['planning', 'habits', 'calendar', 'health', 'other'];

function tj_article_places(array $a): array {
    $p = json_decode((string)($a['placements'] ?? '["list"]'), true);
    return is_array($p) ? array_values(array_intersect(TJ_ARTICLE_PLACES, $p)) : ['list'];
}

/* Published articles of one language shown in $place, newest first. */
function tj_articles_in(string $lang, string $place, int $limit = 0): array {
    $out = [];
    foreach (tj_published_articles($lang) as $a) {
        if (!in_array($place, tj_article_places($a), true)) continue;
        $out[] = $a;
        if ($limit && count($out) >= $limit) break;
    }
    return $out;
}

/* GET /articles?lang=fa — every published article of a language, for the
 * app's Articles page (Profile): topic, date, and its address on the site. */
function tj_public_articles(): void {
    $lang = ($_GET['lang'] ?? '') === 'en' ? 'en' : 'fa';
    tj_json(array_map(function ($a) use ($lang) {
        return ['title' => $a['title'], 'summary' => $a['summary'], 'cover' => $a['cover'], 'category' => $a['category'] ?? 'other',
                'published_at' => $a['published_at'], 'url' => '/' . $lang . '/articles/' . $a['slug'] . '/'];
    }, tj_published_articles($lang)));
}

/* GET /articles/featured: what the app's desks show, both languages. */
function tj_public_featured_articles(): void {
    $out = [];
    foreach (['fa', 'en'] as $l) {
        foreach (['app_period'] as $p) {
            $out[$l][$p] = array_map(function ($a) use ($l) {
                return ['title' => $a['title'], 'summary' => $a['summary'], 'cover' => $a['cover'], 'url' => '/' . $l . '/articles/' . $a['slug'] . '/'];
            }, tj_articles_in($l, $p, TJ_ARTICLE_PLACE_LIMIT));
        }
    }
    tj_json($out);
}

/* The landing page's "articles" section, before the closing call to
 * action; nothing when no article is placed there. */
function tj_landing_articles(string $html, string $lang): string {
    $list = tj_articles_in($lang, 'landing', 3);
    if (!$list) return $html;
    $h = function (string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); };
    $cards = '';
    foreach ($list as $a) {
        $cards .= '<a class="article-card" href="/' . $lang . '/articles/' . $h($a['slug']) . '/">'
            . ($a['cover'] ? '<img src="' . $h($a['cover']) . '" alt="" loading="lazy" width="1600" height="900">' : '')
            . '<span class="article-card-body"><h3>' . $h($a['title']) . '</h3>'
            . ($a['summary'] !== '' ? '<p>' . $h($a['summary']) . '</p>' : '') . '</span></a>';
    }
    $title = $lang === 'fa' ? 'مقاله‌ها' : 'Articles';
    $all = $lang === 'fa' ? 'همه‌ی مقاله‌ها' : 'All articles';
    $section = '<section class="section landing-articles" aria-labelledby="articles-title">'
        . '<h2 id="articles-title">' . $title . '</h2><div class="article-list">' . $cards . '</div>'
        . '<p class="landing-articles-more"><a href="/' . $lang . '/articles/">' . $all . '</a></p></section>' . "\n\n    ";
    return preg_replace_callback('#<section class="section cta-band"#', function ($m) use ($section) { return $section . $m[0]; }, $html, 1);
}
const TJ_ARTICLE_COVER = [1600, 900];

/* "## heading", "- list item", blank line = new paragraph,
 * **bold**, [text](https://link) or [text](/fa/page/). Escaped first, so
 * nothing else works. Links to our own pages are ordinary links (search
 * engines follow them between our pages); other sites open in a new tab,
 * nofollow. */
function tj_article_html(string $body): string {
    $e = function (string $s): string {
        $s = htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $s = preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $s);
        return preg_replace_callback('/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]*)\)/u', function ($m) {
            $href = $m[2];
            if (preg_match('#^https://toojibee\.ir(/.*)?$#', $href, $own)) $href = $own[1] ?? '/';
            if ($href[0] === '/' && substr($href, 0, 2) !== '//') return '<a href="' . $href . '">' . $m[1] . '</a>';
            if (!preg_match('#^https?://#', $href)) return $m[1];
            return '<a href="' . $href . '" rel="nofollow noopener noreferrer" target="_blank">' . $m[1] . '</a>';
        }, $s);
    };
    $out = [];
    foreach (preg_split('/\n\s*\n/u', str_replace("\r\n", "\n", trim($body))) as $block) {
        $lines = array_values(array_filter(array_map('trim', explode("\n", $block)), 'strlen'));
        if (!$lines) continue;
        if (preg_match('/^#{2,3}\s+(.+)$/u', $lines[0], $m) && count($lines) === 1) { $out[] = '<h2>' . $e($m[1]) . '</h2>'; continue; }
        if (count(array_filter($lines, function ($l) { return preg_match('/^[-•*]\s+/u', $l); })) === count($lines)) {
            $out[] = '<ul>' . implode('', array_map(function ($l) use ($e) { return '<li>' . $e(preg_replace('/^[-•*]\s+/u', '', $l)) . '</li>'; }, $lines)) . '</ul>';
            continue;
        }
        $out[] = '<p>' . implode('<br>', array_map($e, $lines)) . '</p>';
    }
    return implode("\n", $out);
}

function tj_article_public(array $a, bool $withBody = false): array {
    $o = [
        'id' => $a['public_id'], 'lang' => $a['lang'], 'slug' => $a['slug'], 'title' => $a['title'], 'summary' => $a['summary'],
        'cover' => $a['cover'], 'status' => $a['status'], 'review_note' => $a['review_note'], 'placements' => tj_article_places($a),
        'author' => $a['author_email'] ?? null, 'reviewer' => $a['reviewer_email'] ?? null,
        'created_at' => $a['created_at'], 'updated_at' => $a['updated_at'], 'submitted_at' => $a['submitted_at'], 'published_at' => $a['published_at'],
        'url' => '/' . $a['lang'] . '/articles/' . $a['slug'] . '/', 'category' => $a['category'] ?? 'other',
    ];
    if ($withBody) $o['body'] = $a['body'];
    return $o;
}

function tj_article_find(string $publicId): array {
    $q = tj_db()->prepare('SELECT ar.*, au.email AS author_email, rv.email AS reviewer_email FROM tj_articles ar
                           LEFT JOIN tj_admins au ON au.id = ar.author_id LEFT JOIN tj_admins rv ON rv.id = ar.reviewer_id
                           WHERE ar.public_id = ?');
    $q->execute([$publicId]);
    $a = $q->fetch();
    if (!$a) tj_fail(404, 'not_found');
    return $a;
}

function tj_article_can_review(array $me): bool { return in_array('articles.review', tj_admin_perms($me), true); }

/* Writers only reach their own; reviewers reach all. */
function tj_article_for(array $me, string $publicId): array {
    $a = tj_article_find($publicId);
    if (!tj_article_can_review($me) && (int)$a['author_id'] !== (int)$me['id']) tj_fail(403, 'forbidden');
    return $a;
}

function tj_admin_articles_gate(): array {
    tj_admin_gate();
    $me = tj_admin_current();
    $p = tj_admin_perms($me);
    if (!in_array('articles.write', $p, true) && !in_array('articles.review', $p, true)) tj_fail(403, 'forbidden');
    return $me;
}

function tj_article_fields(array $b, ?array $current): array {
    $f = [];
    $lang = $b['lang'] ?? ($current['lang'] ?? 'fa');
    if (!in_array($lang, ['fa', 'en'], true)) tj_fail(400, 'validation_error', ['fields' => ['lang' => ['invalid']]]);
    $f['lang'] = $lang;
    $f['title'] = tj_str($b, 'title', 160) ?: ($current['title'] ?? '');
    if ($f['title'] === '') tj_fail(400, 'validation_error', ['fields' => ['title' => ['required']]]);
    $f['summary'] = array_key_exists('summary', $b) ? tj_str($b, 'summary', 300) : ($current['summary'] ?? '');
    $body = array_key_exists('body', $b) && is_string($b['body']) ? $b['body'] : ($current['body'] ?? '');
    if (strlen($body) > 100000) tj_fail(400, 'too_large');
    $f['body'] = $body;
    $slug = strtolower(tj_str($b, 'slug', 80));
    if ($slug === '') $slug = $current['slug'] ?? ('a-' . strtolower(tj_random_code(6)));
    if (!preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $slug) || strlen($slug) < 3) tj_fail(400, 'validation_error', ['fields' => ['slug' => ['invalid']]]);
    $q = tj_db()->prepare('SELECT public_id FROM tj_articles WHERE lang = ? AND slug = ?');
    $q->execute([$lang, $slug]);
    $other = $q->fetch();
    if ($other && (!$current || $other['public_id'] !== $current['public_id'])) tj_fail(409, 'slug_taken');
    $f['slug'] = $slug;
    $places = array_key_exists('placements', $b) && is_array($b['placements'])
        ? array_values(array_intersect(TJ_ARTICLE_PLACES, $b['placements']))
        : ($current ? tj_article_places($current) : ['list']);
    $f['placements'] = json_encode($places);
    $cat = (string)($b['category'] ?? ($current['category'] ?? 'other'));
    $f['category'] = in_array($cat, TJ_ARTICLE_CATEGORIES, true) ? $cat : 'other';
    return $f;
}

/* ---- admin endpoints ---- */

function tj_admin_articles(): void {
    $me = tj_admin_articles_gate();
    $status = (string)($_GET['status'] ?? '');
    $where = []; $args = [];
    if (in_array($status, TJ_ARTICLE_STATUSES, true)) { $where[] = 'ar.status = ?'; $args[] = $status; }
    if (!tj_article_can_review($me)) { $where[] = 'ar.author_id = ?'; $args[] = $me['id']; }
    $q = tj_db()->prepare('SELECT ar.*, au.email AS author_email, rv.email AS reviewer_email FROM tj_articles ar
                           LEFT JOIN tj_admins au ON au.id = ar.author_id LEFT JOIN tj_admins rv ON rv.id = ar.reviewer_id'
                           . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY ar.updated_at DESC LIMIT 200');
    $q->execute($args);
    $counts = [];
    foreach (TJ_ARTICLE_STATUSES as $s) $counts[$s] = 0;
    $cq = tj_db()->prepare('SELECT status, COUNT(*) AS n FROM tj_articles' . (tj_article_can_review($me) ? '' : ' WHERE author_id = ?') . ' GROUP BY status');
    $cq->execute(tj_article_can_review($me) ? [] : [$me['id']]);
    foreach ($cq->fetchAll() as $r) $counts[$r['status']] = (int)$r['n'];
    tj_json(['items' => array_map('tj_article_public', $q->fetchAll()), 'counts' => $counts, 'can_review' => tj_article_can_review($me), 'can_write' => in_array('articles.write', tj_admin_perms($me), true)]);
}

function tj_admin_article(string $id): void {
    $me = tj_admin_articles_gate();
    $a = tj_article_for($me, $id);
    tj_json(tj_article_public($a, true) + ['preview_html' => tj_article_html($a['body'])]);
}

function tj_admin_article_create(): void {
    $me = tj_admin_articles_gate();
    if (!in_array('articles.write', tj_admin_perms($me), true)) tj_fail(403, 'forbidden');
    $f = tj_article_fields(tj_body(), null);
    $pid = tj_new_public_id();
    tj_db()->prepare('INSERT INTO tj_articles (public_id, lang, slug, title, summary, body, placements, category, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$pid, $f['lang'], $f['slug'], $f['title'], $f['summary'], $f['body'], $f['placements'], $f['category'], 'draft', $me['id'], tj_now(), tj_now()]);
    tj_admin_audit((int)$me['id'], 'article_created', $f['lang'] . '/' . $f['slug']);
    tj_json(tj_article_public(tj_article_find($pid), true), 201);
}

function tj_admin_article_update(string $id): void {
    $me = tj_admin_articles_gate();
    $a = tj_article_for($me, $id);
    // Writers edit while it's theirs to edit; reviewers any time.
    if (!tj_article_can_review($me) && !in_array($a['status'], ['draft', 'rejected'], true)) tj_fail(409, 'locked_in_review');
    $f = tj_article_fields(tj_body(), $a);
    tj_db()->prepare('UPDATE tj_articles SET lang = ?, slug = ?, title = ?, summary = ?, body = ?, placements = ?, category = ?, updated_at = ? WHERE id = ?')
        ->execute([$f['lang'], $f['slug'], $f['title'], $f['summary'], $f['body'], $f['placements'], $f['category'], tj_now(), $a['id']]);
    tj_admin_audit((int)$me['id'], 'article_edited', $f['lang'] . '/' . $f['slug']);
    tj_json(tj_article_public(tj_article_find($id), true));
}

/* POST /admin/articles/<id>/<action> */
function tj_admin_article_action(string $id, string $action): void {
    $me = tj_admin_articles_gate();
    $a = tj_article_for($me, $id);
    $db = tj_db();
    $mine = (int)$a['author_id'] === (int)$me['id'];
    $label = $a['lang'] . '/' . $a['slug'];
    if ($action === 'submit') {
        if (!$mine || !in_array($a['status'], ['draft', 'rejected'], true)) tj_fail(409, 'bad_state');
        if (trim($a['body']) === '') tj_fail(400, 'validation_error', ['fields' => ['body' => ['required']]]);
        $db->prepare("UPDATE tj_articles SET status = 'pending', submitted_at = ?, review_note = NULL, updated_at = ? WHERE id = ?")->execute([tj_now(), tj_now(), $a['id']]);
        tj_admin_audit((int)$me['id'], 'article_submitted', $label);
    } elseif ($action === 'approve' || $action === 'reject') {
        if (!tj_article_can_review($me)) tj_fail(403, 'forbidden');
        if ($mine && (int)$me['is_owner'] !== 1) tj_fail(403, 'own_article');
        if (!in_array($a['status'], ['pending', 'draft', 'rejected'], true)) tj_fail(409, 'bad_state');
        $note = tj_str(tj_body(), 'note', 500);
        if ($action === 'reject' && $note === '') tj_fail(400, 'note_required');
        if ($action === 'approve' && trim($a['body']) === '') tj_fail(400, 'validation_error', ['fields' => ['body' => ['required']]]);
        $db->prepare('UPDATE tj_articles SET status = ?, reviewer_id = ?, review_note = ?, published_at = ?, updated_at = ? WHERE id = ?')
            ->execute([$action === 'approve' ? 'published' : 'rejected', $me['id'], $note ?: null, $action === 'approve' ? tj_now() : null, tj_now(), $a['id']]);
        tj_admin_audit((int)$me['id'], $action === 'approve' ? 'article_published' : 'article_rejected', $label . ($note ? ": $note" : ''));
    } elseif ($action === 'unpublish') {
        if (!tj_article_can_review($me) || $a['status'] !== 'published') tj_fail(409, 'bad_state');
        $db->prepare("UPDATE tj_articles SET status = 'draft', published_at = NULL, updated_at = ? WHERE id = ?")->execute([tj_now(), $a['id']]);
        tj_admin_audit((int)$me['id'], 'article_unpublished', $label);
    } elseif ($action === 'delete') {
        if (!tj_article_can_review($me) && !($mine && in_array($a['status'], ['draft', 'rejected'], true))) tj_fail(403, 'forbidden');
        tj_remove_upload($a['cover']);
        $db->prepare('DELETE FROM tj_articles WHERE id = ?')->execute([$a['id']]);
        tj_admin_audit((int)$me['id'], 'article_deleted', $label);
        tj_json(['ok' => true]);
    } elseif ($action === 'cover') {
        if (!tj_article_can_review($me) && !($mine && in_array($a['status'], ['draft', 'rejected'], true))) tj_fail(409, 'locked_in_review');
        $url = tj_save_upload_image(TJ_ARTICLE_COVER[0], TJ_ARTICLE_COVER[1]);
        tj_remove_upload($a['cover']);
        $db->prepare('UPDATE tj_articles SET cover = ?, updated_at = ? WHERE id = ?')->execute([$url, tj_now(), $a['id']]);
        tj_admin_audit((int)$me['id'], 'article_cover', $label);
    } elseif ($action === 'cover-remove') {
        tj_remove_upload($a['cover']);
        $db->prepare('UPDATE tj_articles SET cover = NULL, updated_at = ? WHERE id = ?')->execute([tj_now(), $a['id']]);
    } else {
        tj_fail(404, 'not_found');
    }
    tj_json(tj_article_public(tj_article_find($id), true));
}

/* ---- public ---- */

function tj_published_articles(string $lang): array {
    $q = tj_db()->prepare("SELECT * FROM tj_articles WHERE lang = ? AND status = 'published' ORDER BY published_at DESC");
    $q->execute([$lang]);
    return $q->fetchAll();
}

/* Adds "Articles" to a page's footer links once something is published
 * in that language (landing via page.php, and the article pages). */
function tj_footer_with_articles(string $html, string $lang): string {
    $li = '';
    // "Today's date" (today.php) is always there on the live host.
    if (strpos($html, '<li><a href="/' . $lang . '/today/">') === false)
        $li .= '<li><a href="/' . $lang . '/today/">' . ($lang === 'fa' ? 'تاریخ امروز' : "Today's date") . '</a></li>';
    // The year calendar (yearcal.php), named with the year people search for.
    if (strpos($html, '<li><a href="/' . $lang . '/calendar/">') === false && function_exists('tj_jalali')) {
        [$jy] = tj_jalali((int)date('Y'), (int)date('n'), (int)date('j'));
        $li .= '<li><a href="/' . $lang . '/calendar/">' . ($lang === 'fa' ? 'تقویم ' . tj_fa_digits((string)$jy) : "Calendar $jy") . '</a></li>';
    }
    if (strpos($html, '<li><a href="/' . $lang . '/articles/">') === false && tj_articles_in($lang, 'list', 1))
        $li .= '<li><a href="/' . $lang . '/articles/">' . ($lang === 'fa' ? 'مقاله‌ها' : 'Articles') . '</a></li>';
    if ($li === '') return $html;
    return preg_replace_callback('#(<ul class="footer-links">)#', function ($m) use ($li) { return $m[1] . "\n        " . $li; }, $html, 1);
}

function tj_published_article(string $lang, string $slug): ?array {
    $q = tj_db()->prepare("SELECT * FROM tj_articles WHERE lang = ? AND slug = ? AND status = 'published'");
    $q->execute([$lang, $slug]);
    return $q->fetch() ?: null;
}
