<?php
/* Site content editable from the admin panel (content.manage):
 * - landing hero text (eyebrow, title, text) per language,
 * - landing screenshots (hero phone + desktop, light + dark, per language),
 * - the app's top banner: a main one and an occasion one (shown instead,
 *   until its end time, then removed by itself), each with a day and a night
 *   picture (JPEG/PNG/WebP, or an animated GIF kept as it is), and titles.
 *
 * Stored as one JSON document (tj_content 'site'). Anything not set
 * means "keep what's in the static HTML", so an empty store changes
 * nothing. The landing pages get it server-side (page.php), the app via
 * GET /content; neither adds a request to the marketing site.
 *
 * Uploads: only JPEG/PNG/WebP, checked by content (not by name), saved
 * under a random name in /uploads (where .htaccess serves images only).
 * With GD the picture is cropped to its slot's shape, scaled down and
 * re-encoded as WebP (smaller on slow networks, and strips anything
 * hidden in the original file). */
declare(strict_types=1);

const TJ_CONTENT_LANGS = ['fa', 'en'];
const TJ_CONTENT_TEXT = ['eyebrow' => 80, 'title' => 120, 'text' => 400];
const TJ_BANNER_TITLE_MAX = 40;
const TJ_UPLOAD_MAX = 6 * 1024 * 1024;
// slot => [width, height] the picture is fitted to (0 height = keep ratio).
const TJ_IMAGE_SLOTS = [
    'hero_mobile_light' => [750, 1624], 'hero_mobile_dark' => [750, 1624],
    'desktop_light' => [1600, 1018], 'desktop_dark' => [1600, 1018],
];
const TJ_BANNER_SIZE = [2000, 0];
// The banner's pictures: main/occasion × day/night. ('banner' was the one
// picture before; it's read as the main day picture.)
const TJ_BANNER_SLOTS = ['banner_main_light', 'banner_main_dark', 'banner_occ_light', 'banner_occ_dark'];
const TJ_GIF_MAX = 3 * 1024 * 1024; // kept as uploaded (re-encoding would stop it moving), so smaller

function tj_content_get(): array {
    static $c = null;
    if ($c !== null) return $c;
    $q = tj_db()->prepare('SELECT value FROM tj_content WHERE name = ?');
    $q->execute(['site']);
    $row = $q->fetch();
    $c = $row ? (json_decode($row['value'], true) ?: []) : [];
    $c += ['landing' => [], 'images' => [], 'banner' => []];
    if (isset($c['images']['banner']) && !isset($c['images']['banner_main_light'])) $c['images']['banner_main_light'] = $c['images']['banner'];
    unset($c['images']['banner']);
    return $c;
}

function tj_content_save(array $c, int $adminId): void {
    $db = tj_db();
    $json = json_encode($c, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $q = $db->prepare('SELECT 1 FROM tj_content WHERE name = ?');
    $q->execute(['site']);
    if ($q->fetch()) {
        $db->prepare('UPDATE tj_content SET value = ?, updated_at = ?, updated_by = ? WHERE name = ?')->execute([$json, tj_now(), $adminId, 'site']);
    } else {
        $db->prepare('INSERT INTO tj_content (name, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')->execute(['site', $json, tj_now(), $adminId]);
    }
}

/* All image slots: banner, and every landing slot per language. */
function tj_content_slots(): array {
    $s = TJ_BANNER_SLOTS;
    foreach (TJ_CONTENT_LANGS as $l) foreach (array_keys(TJ_IMAGE_SLOTS) as $k) $s[] = "$l.$k";
    return $s;
}

function tj_uploads_dir(): string {
    $dir = dirname(__DIR__, 2) . '/uploads'; // public_html/uploads
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) tj_fail(500, 'uploads_unwritable');
    if (!is_file("$dir/.htaccess") || strpos((string)@file_get_contents("$dir/.htaccess"), 'gif') === false) {
        @file_put_contents("$dir/.htaccess", "# Uploaded images only; nothing here ever runs.\nOptions -Indexes\n<FilesMatch \".*\">\n  Require all denied\n</FilesMatch>\n<FilesMatch \"\\.(webp|jpe?g|png|gif)$\">\n  Require all granted\n</FilesMatch>\n");
    }
    return $dir;
}

function tj_remove_upload(?string $url): void {
    if ($url && preg_match('#^/uploads/([a-f0-9]{32}\.(webp|jpg|png|gif))$#', $url, $m)) @unlink(tj_uploads_dir() . '/' . $m[1]);
}

/* Center-crop to w×h (or keep the ratio when h = 0), never upscale. */
function tj_image_fit($img, int $w, int $h) {
    $sw = imagesx($img); $sh = imagesy($img);
    if ($h === 0) { $h = (int)round($sh * min(1, $w / $sw)); $w = (int)round($sw * min(1, $w / $sw)); $cx = 0; $cy = 0; $cw = $sw; $ch = $sh; }
    else {
        $target = $w / $h;
        if ($sw / $sh > $target) { $ch = $sh; $cw = (int)round($sh * $target); $cx = (int)(($sw - $cw) / 2); $cy = 0; }
        else { $cw = $sw; $ch = (int)round($sw / $target); $cx = 0; $cy = (int)(($sh - $ch) / 2); }
        if ($cw < $w) { $w = $cw; $h = (int)round($cw / $target); }
    }
    $out = imagecreatetruecolor($w, $h);
    imagealphablending($out, false); imagesavealpha($out, true);
    imagecopyresampled($out, $img, 0, 0, $cx, $cy, $w, $h, $cw, $ch);
    return $out;
}

/* ---- public ---- */

/* An occasion banner whose end time has passed is removed for good: its
 * pictures deleted, its time and titles cleared. Runs whenever the content
 * is read, so nothing has to be scheduled. */
function tj_banner_expire(array &$c): void {
    $until = $c['banner']['occ_until'] ?? '';
    if ($until === '' || $until > tj_now()) return;
    foreach (['banner_occ_light', 'banner_occ_dark'] as $s) { tj_remove_upload($c['images'][$s] ?? null); unset($c['images'][$s]); }
    unset($c['banner']['occ_until'], $c['banner']['occ_title_fa'], $c['banner']['occ_title_en']);
    tj_content_save($c, 0);
}

function tj_public_content(): void {
    $c = tj_content_get();
    tj_banner_expire($c);
    $b = $c['banner']; $i = $c['images'];
    $occ = !empty($i['banner_occ_light']) || !empty($i['banner_occ_dark'])
        ? ['light' => $i['banner_occ_light'] ?? null, 'dark' => $i['banner_occ_dark'] ?? null,
           'until' => !empty($b['occ_until']) ? gmdate('c', strtotime($b['occ_until'] . ' UTC')) : null,
           'title' => ['fa' => $b['occ_title_fa'] ?? null, 'en' => $b['occ_title_en'] ?? null]]
        : null;
    tj_json(['banner' => [
        'main' => ['light' => $i['banner_main_light'] ?? null, 'dark' => $i['banner_main_dark'] ?? null],
        'occasion' => $occ,
        'image' => $i['banner_main_light'] ?? null, // apps from before day/night pictures
        'title' => ['fa' => $b['title_fa'] ?? null, 'en' => $b['title_en'] ?? null],
    ]]);
}

/* The landing page with the saved content put in (page.php). */
function tj_render_landing(string $html, string $lang): string {
    $c = tj_content_get();
    foreach (TJ_CONTENT_TEXT as $field => $max) {
        $v = $c['landing'][$lang][$field] ?? '';
        if ($v === '') continue;
        $inner = htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        if ($field === 'title') $inner = preg_replace('/\*([^*]+)\*/u', '<em>$1</em>', $inner); // *word* = highlighted
        $html = preg_replace_callback('#(<(\w+)[^>]*\sdata-c="' . $field . '"[^>]*>)(.*?)(</\2>)#s',
            function ($m) use ($inner) { return $m[1] . $inner . $m[4]; }, $html, 1);
    }
    foreach (array_keys(TJ_IMAGE_SLOTS) as $slot) {
        $url = $c['images']["$lang.$slot"] ?? null;
        if (!$url) continue;
        $html = preg_replace_callback('#(<img[^>]*\sdata-c-img="' . $slot . '"[^>]*\ssrc=")[^"]*(")#',
            function ($m) use ($url) { return $m[1] . htmlspecialchars($url, ENT_QUOTES) . $m[2]; }, $html, 1);
    }
    return $html;
}

/* The hero's small line above the title: a random short quote on every
 * request, from data/quotes-<lang>.txt ("sentence<TAB>author" per line,
 * made by deploy/make-quotes.py). Jumps to a random byte and takes the
 * next whole line, so the file is never read in full. Without the file
 * the eyebrow text (static or from the panel) stays. */
function tj_landing_quote(string $html, string $lang): string {
    $file = dirname(__DIR__) . "/data/quotes-$lang.txt";
    $size = @filesize($file);
    $f = $size ? @fopen($file, 'rb') : false;
    if (!$f) return $html;
    fseek($f, random_int(0, $size - 1));
    fgets($f); // the rest of the line we landed in
    $line = fgets($f);
    if ($line === false || trim($line) === '') { rewind($f); $line = fgets($f); } // past the last line
    fclose($f);
    $parts = explode("\t", trim((string)$line), 2);
    if (count($parts) !== 2 || $parts[0] === '') return $html;
    [$open, $close] = $lang === 'fa' ? ['«', '»'] : ["\u{201C}", "\u{201D}"];
    $inner = htmlspecialchars($open . $parts[0] . $close, ENT_QUOTES, 'UTF-8')
        . ' <span class="hero-quote-by">— ' . htmlspecialchars($parts[1], ENT_QUOTES, 'UTF-8') . '</span>';
    return preg_replace_callback('#(<(\w+)[^>]*\sdata-c="eyebrow"[^>]*>)(.*?)(</\2>)#s',
        function ($m) use ($inner) { return $m[1] . $inner . $m[4]; }, $html, 1);
}

/* ---- admin ---- */

function tj_admin_content(): void {
    tj_admin_require('content.manage');
    $c = tj_content_get();
    tj_banner_expire($c);
    $q = tj_db()->prepare('SELECT c.updated_at, a.email FROM tj_content c LEFT JOIN tj_admins a ON a.id = c.updated_by WHERE c.name = ?');
    $q->execute(['site']);
    tj_json($c + ['slots' => tj_content_slots(), 'limits' => TJ_CONTENT_TEXT + ['banner_title' => TJ_BANNER_TITLE_MAX], 'gd' => function_exists('imagewebp'), 'last_change' => $q->fetch() ?: null]);
}

function tj_admin_content_save(): void {
    $me = tj_admin_require('content.manage');
    $b = tj_body();
    $c = tj_content_get();
    foreach (TJ_CONTENT_LANGS as $l) {
        foreach (TJ_CONTENT_TEXT as $field => $max) {
            if (!isset($b['landing'][$l][$field]) || !is_string($b['landing'][$l][$field])) continue;
            $v = function_exists('mb_substr') ? mb_substr(trim($b['landing'][$l][$field]), 0, $max) : substr(trim($b['landing'][$l][$field]), 0, $max);
            if ($v === '') unset($c['landing'][$l][$field]); else $c['landing'][$l][$field] = $v;
        }
        foreach (["title_$l", "occ_title_$l"] as $k) {
            if (isset($b['banner'][$k]) && is_string($b['banner'][$k])) {
                $v = function_exists('mb_substr') ? mb_substr(trim($b['banner'][$k]), 0, TJ_BANNER_TITLE_MAX) : trim($b['banner'][$k]);
                if ($v === '') unset($c['banner'][$k]); else $c['banner'][$k] = $v;
            }
        }
    }
    // The occasion banner's end (ISO time from the panel; empty = no end).
    if (isset($b['banner']['occ_until']) && is_string($b['banner']['occ_until'])) {
        $ts = trim($b['banner']['occ_until']) === '' ? false : strtotime($b['banner']['occ_until']);
        if ($ts === false) unset($c['banner']['occ_until']);
        elseif ($ts <= time()) tj_fail(400, 'until_in_past');
        else $c['banner']['occ_until'] = gmdate('Y-m-d H:i:s', $ts);
    }
    tj_content_save($c, (int)$me['id']);
    tj_admin_audit((int)$me['id'], 'content_saved', 'landing/banner text');
    tj_json(['ok' => true]);
}

function tj_admin_content_image(): void {
    $me = tj_admin_require('content.manage');
    $slot = (string)($_GET['slot'] ?? '');
    if (!in_array($slot, tj_content_slots(), true)) tj_fail(400, 'bad_slot');
    $banner = in_array($slot, TJ_BANNER_SLOTS, true);
    [$w, $h] = $banner ? TJ_BANNER_SIZE : TJ_IMAGE_SLOTS[substr($slot, 3)];
    $url = tj_save_upload_image($w, $h, $banner);
    $c = tj_content_get();
    tj_remove_upload($c['images'][$slot] ?? null);
    $c['images'][$slot] = $url;
    tj_content_save($c, (int)$me['id']);
    tj_admin_audit((int)$me['id'], 'image_uploaded', $slot);
    tj_json(['url' => $url], 201);
}

/* The uploaded $_FILES['file'], checked and saved in /uploads, fitted to
 * w×h (h = 0: keep the ratio). Returns its /uploads/... address. */
function tj_save_upload_image(int $w, int $h, bool $allowGif = false): string {
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        tj_fail(400, in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'too_large' : 'no_file');
    }
    if ($f['size'] > TJ_UPLOAD_MAX) tj_fail(400, 'too_large');
    $info = @getimagesize($f['tmp_name']);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if ($allowGif) $types[IMAGETYPE_GIF] = 'gif';
    if (!$info || !isset($types[$info[2]]) || $info[0] > 8000 || $info[1] > 8000) tj_fail(400, 'not_an_image');

    $dir = tj_uploads_dir();
    $name = bin2hex(random_bytes(16));
    if ($info[2] === IMAGETYPE_GIF) {
        // A GIF moves only as it is: kept byte for byte (checked to be a GIF above), size-capped.
        if ($f['size'] > TJ_GIF_MAX) tj_fail(400, 'gif_too_large');
        if (!move_uploaded_file($f['tmp_name'], "$dir/$name.gif")) tj_fail(500, 'save_failed');
        @chmod("$dir/$name.gif", 0644);
        return "/uploads/$name.gif";
    }
    $src = function_exists('imagewebp') ? @imagecreatefromstring((string)file_get_contents($f['tmp_name'])) : false;
    if ($src) {
        $out = tj_image_fit($src, $w, $h);
        $file = "$name.webp";
        if (!imagewebp($out, "$dir/$file", 82)) tj_fail(500, 'save_failed');
        imagedestroy($src); imagedestroy($out);
    } else {
        // No GD on this PHP: keep the original (still checked to be an image).
        $file = $name . '.' . $types[$info[2]];
        if (!move_uploaded_file($f['tmp_name'], "$dir/$file")) tj_fail(500, 'save_failed');
    }
    @chmod("$dir/$file", 0644);
    return "/uploads/$file";
}

function tj_admin_content_image_reset(): void {
    $me = tj_admin_require('content.manage');
    $slot = tj_str(tj_body(), 'slot', 40);
    if (!in_array($slot, tj_content_slots(), true)) tj_fail(400, 'bad_slot');
    $c = tj_content_get();
    tj_remove_upload($c['images'][$slot] ?? null);
    unset($c['images'][$slot]);
    tj_content_save($c, (int)$me['id']);
    tj_admin_audit((int)$me['id'], 'image_reset', $slot);
    tj_json(['ok' => true]);
}
