<?php
/* The months of the Solar Hijri year: /fa/calendar/months/ (all twelve)
 * and /fa/calendar/farvardin/ … /fa/calendar/esfand/ (one month: this
 * year's grid with holidays and occasions, its Hijri and Gregorian range,
 * where the name comes from, its zodiac sign and its old festivals). The
 * same under /en/. Facts about the names and festivals are the commonly
 * documented ones (Avestan month names, the "-gan" festivals held when a
 * day's name and the month's name match). */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/calendar.php';
require __DIR__ . '/lib/dates.php';
require __DIR__ . '/lib/articles.php';
require __DIR__ . '/lib/page.php';

$lang = (($_GET['lang'] ?? '') === 'en') ? 'en' : 'fa';
$fa = $lang === 'fa';
$n = function ($v) use ($fa): string { return $fa ? tj_fa_digits((string)$v) : (string)$v; };

const TJ_MONTH_SLUGS = ['farvardin', 'ordibehesht', 'khordad', 'tir', 'mordad', 'shahrivar', 'mehr', 'aban', 'azar', 'dey', 'bahman', 'esfand'];
/* [origin fa, origin en, zodiac fa, zodiac en, festivals fa, festivals en] */
const TJ_MONTH_INFO = [
    ['از «فَرَوَشی» (فروهر) در اوستا؛ نیروی نگهبان و روان پاک درگذشتگان.', 'From the Avestan fravashi: the guardian spirits, the souls of the righteous.',
     'حَمَل (قوچ)', 'Aries (the Ram)', 'نوروز (۱ فروردین)، سیزده‌به‌در (۱۳ فروردین) و فروردینگان (۱۹ فروردین).', 'Nowruz (1 Farvardin), Sizdah Bedar (13 Farvardin) and Farvardingan (19 Farvardin).'],
    ['از «اَشَه وَهیشته» در اوستا؛ به معنای بهترین راستی و پاکی.', 'From the Avestan Asha Vahishta, "best truth" or righteousness.',
     'ثَور (گاو)', 'Taurus (the Bull)', 'اردیبهشتگان (۳ اردیبهشت).', 'Ordibeheshtgan (3 Ordibehesht).'],
    ['از «هَئوروَتات» در اوستا؛ به معنای رسایی و کمال، و نگهبان آب‌ها.', 'From the Avestan Haurvatat, "wholeness" or perfection, guardian of the waters.',
     'جَوزا (دوپیکر)', 'Gemini (the Twins)', 'خردادگان (۶ خرداد).', 'Khordadgan (6 Khordad).'],
    ['از «تیشتریه» در اوستا؛ ایزد باران و ستاره‌ی تیشتر (شِعرای یمانی).', 'From the Avestan Tishtrya, the rain-bringing star (Sirius).',
     'سَرَطان (خرچنگ)', 'Cancer (the Crab)', 'تیرگان (۱۳ تیر)؛ جشن آب‌پاشی و بستن بند تیر و باد.', 'Tirgan (13 Tir), celebrated with water-splashing.'],
    ['از «اَمِرِتات» (امرداد) در اوستا؛ به معنای بی‌مرگی و جاودانگی.', 'From the Avestan Ameretat (Amordad), "immortality".',
     'اَسَد (شیر)', 'Leo (the Lion)', 'امردادگان (۷ امرداد).', 'Amordadgan (7 Mordad).'],
    ['از «خشَثرَه وَئیریه» در اوستا؛ به معنای شهریاری آرمانی و نیک.', 'From the Avestan Khshathra Vairya, "desirable dominion".',
     'سُنبُله (خوشه)', 'Virgo (the Ear of Grain)', 'شهریورگان (۴ شهریور).', 'Shahrivargan (4 Shahrivar).'],
    ['از «میترا» (مهر)؛ ایزد پیمان، دوستی و روشنایی.', 'From Mithra (Mehr), the deity of covenant, friendship and light.',
     'میزان (ترازو)', 'Libra (the Scales)', 'مهرگان (۱۰ مهر در تقویم امروز؛ در گاه‌شماری کهن ۱۶ مهر، روز مهر از ماه مهر)، از بزرگ‌ترین جشن‌های ایران باستان.', 'Mehregan (10 Mehr in today\'s calendar; 16 Mehr, the day of Mehr in the month of Mehr, in the old one), one of the great festivals of ancient Iran.'],
    ['از «آپ» به معنای آب‌ها؛ ماه ایزدان نگهبان آب.', 'From ap, "waters": the month of the guardians of water.',
     'عَقرَب (کژدم)', 'Scorpio (the Scorpion)', 'آبانگان (۱۰ آبان).', 'Abangan (10 Aban).'],
    ['از «آتَر» (آذر) به معنای آتش.', 'From atar (Azar), "fire".',
     'قَوس (کمان)', 'Sagittarius (the Archer)', 'آذرگان (۹ آذر) و شب یلدا، بلندترین شب سال (شب آخر آذر، پیش از یکم دی).', 'Azargan (9 Azar) and Yalda, the longest night of the year (the last night of Azar, before 1 Dey).'],
    ['از «دَدْوَه» به معنای آفریدگار.', 'From dadvah, "the Creator".',
     'جَدی (بز)', 'Capricorn (the Goat)', 'خرم‌روز (۱ دی) و دی‌گان‌ها (۸، ۱۵ و ۲۳ دی).', 'Khorram-ruz (1 Dey) and the Deygan days (8, 15 and 23 Dey).'],
    ['از «وُهومَنه» در اوستا؛ به معنای اندیشه‌ی نیک.', 'From the Avestan Vohu Manah, "good mind".',
     'دَلو (آبریز)', 'Aquarius (the Water-bearer)', 'بهمنگان (۲ بهمن)، جشن سده (۱۰ بهمن)، جشن آتش، و سپندارمذگان (۲۹ بهمن در تقویم امروز).', 'Bahmangan (2 Bahman), Sadeh (10 Bahman), the fire festival, and Sepandarmazgan (29 Bahman in today\'s calendar).'],
    ['از «سپندارمذ» (سپنتا آرمئیتی)؛ نماد زمین و فروتنی.', 'From Spenta Armaiti (Sepandarmaz), symbol of the earth and devotion.',
     'حوت (ماهی)', 'Pisces (the Fish)', 'چهارشنبه‌سوری (شب آخرین چهارشنبه‌ی سال)؛ سپندارمذگان در گاه‌شماری کهن ۵ اسفند بود و امروز ۲۹ بهمن جشن گرفته می‌شود.', 'Chaharshanbe Suri (the eve of the last Wednesday of the year); Sepandarmazgan was on 5 Esfand in the old calendar and is now held on 29 Bahman.'],
];
const TJ_ORDINALS_FA = ['نخستین', 'دومین', 'سومین', 'چهارمین', 'پنجمین', 'ششمین', 'هفتمین', 'هشتمین', 'نهمین', 'دهمین', 'یازدهمین', 'دوازدهمین'];
const TJ_SEASONS = [['بهار', 'spring'], ['تابستان', 'summer'], ['پاییز', 'autumn'], ['زمستان', 'winter']];

$now = new DateTime('now', new DateTimeZone('Asia/Tehran'));
[$thisYear, $todayM, $todayD] = tj_jalali((int)$now->format('Y'), (int)$now->format('n'), (int)$now->format('j'));
$slug = (string)($_GET['month'] ?? '');
$m = array_search($slug, TJ_MONTH_SLUGS, true);
$monthName = function (int $i) use ($fa): string { return $fa ? TJ_JALALI_MONTHS[$i - 1] : TJ_JALALI_MONTHS_EN[$i - 1]; };
$days = function (int $i) use ($fa, $n): string { return $i <= 6 ? $n(31) : ($i <= 11 ? $n(30) : ($fa ? '۲۹ (در سال کبیسه ۳۰)' : '29 (30 in a leap year)')); };
$season = function (int $i) use ($fa): string { return TJ_SEASONS[intdiv($i - 1, 3)][$fa ? 0 : 1]; };

if ($m === false) {
    // All twelve months.
    $cards = '';
    for ($i = 1; $i <= 12; $i++) {
        $info = TJ_MONTH_INFO[$i - 1];
        $cards .= '<a class="month-card" href="/' . $lang . '/calendar/' . TJ_MONTH_SLUGS[$i - 1] . '/"><h2>' . $n($i) . '. ' . tj_h($monthName($i)) . '</h2>'
            . '<p>' . ($fa ? $days($i) . ' روز · ' . $season($i) . ' · برج ' : $days($i) . ' days · ' . $season($i) . ' · ') . tj_h($info[$fa ? 2 : 3]) . '</p>'
            . '<p class="month-card-sub">' . tj_h($info[$fa ? 4 : 5]) . '</p></a>';
    }
    $main = '<p class="yc-lead">' . ($fa
            ? 'سال شمسی (هجری خورشیدی) دوازده ماه دارد: شش ماه اول ۳۱ روزه، پنج ماه بعد ۳۰ روزه و اسفند ۲۹ روزه (در سال کبیسه ۳۰ روزه). سال با نوروز، همزمان با اعتدال بهاری، شروع می‌شود. نام ماه‌ها از اوستا آمده و در سال ۱۳۰۴ خورشیدی رسمی شد. هر ماه را باز کن تا تقویم امسالش، مناسبت‌ها، برج و جشن‌های کهنش را ببینی.'
            : 'The Solar Hijri (Persian) year has twelve months: the first six have 31 days, the next five 30, and Esfand 29 (30 in a leap year). The year begins at Nowruz, the March equinox. The month names come from the Avesta and became official in 1925 (1304). Open a month for this year\'s calendar, its occasions, zodiac sign and old festivals.') . '</p>'
        . '<div class="month-cards">' . $cards . '</div>';
    $faq = $fa ? [
        ['ماه‌های سال شمسی به ترتیب کدام‌اند؟', 'فروردین، اردیبهشت، خرداد، تیر، مرداد، شهریور، مهر، آبان، آذر، دی، بهمن و اسفند.'],
        ['کدام ماه‌ها ۳۱ روزه‌اند؟', 'شش ماه اول سال (فروردین تا شهریور) ۳۱ روزه‌اند، مهر تا بهمن ۳۰ روزه و اسفند ۲۹ روزه (در سال کبیسه ۳۰ روزه).'],
        ['نام ماه‌های ایرانی از کجا آمده؟', 'از نام ایزدان و مفاهیم اوستایی؛ مثلاً اردیبهشت از «اشه وهیشته» (بهترین راستی) و مهر از «میترا».'],
    ] : [
        ['What are the Persian months in order?', 'Farvardin, Ordibehesht, Khordad, Tir, Mordad, Shahrivar, Mehr, Aban, Azar, Dey, Bahman and Esfand.'],
        ['Which Persian months have 31 days?', 'The first six (Farvardin to Shahrivar) have 31 days, Mehr to Bahman 30, and Esfand 29 (30 in a leap year).'],
        ['Where do the Persian month names come from?', 'From Avestan names and ideas; Ordibehesht, for example, comes from Asha Vahishta ("best truth") and Mehr from Mithra.'],
    ];
    tj_render_page([
        'lang' => $lang, 'path' => "/$lang/calendar/months/", 'alt' => ['fa' => '/fa/calendar/months/', 'en' => '/en/calendar/months/'],
        'title' => $fa ? 'ماه‌های سال شمسی: فروردین تا اسفند، معنی نام‌ها، برج‌ها و جشن‌ها | توجیبی' : 'Persian Calendar Months: Names, Meanings, Zodiac and Festivals | Toojibee',
        'desc' => $fa ? 'ماه‌های تقویم ایرانی از فروردین تا اسفند: تعداد روزها، معنی و ریشه‌ی نام هر ماه، برج فلکی (نماد ماه تولد) و جشن‌های ایرانی مثل نوروز، مهرگان، یلدا و سده.'
            : 'The months of the Iranian calendar from Farvardin to Esfand: days, the meaning of each name, its zodiac sign and Persian festivals like Nowruz, Mehregan, Yalda and Sadeh.',
        'h1' => $fa ? 'ماه‌های سال شمسی (تقویم ایرانی)' : 'The months of the Persian calendar',
        'main' => $main, 'faq' => $faq, 'class' => 'months-page',
        'crumbs' => [[$fa ? 'تقویم' : 'Calendar', "/$lang/calendar/"], [$fa ? 'ماه‌ها' : 'Months', "/$lang/calendar/months/"]],
    ]);
    exit;
}

// One month: this year's grid.
$m = (int)$m + 1;
$info = TJ_MONTH_INFO[$m - 1];
$g = tj_jalali_to_g($thisYear, $m, 1);
$cells = ''; $occ = []; $first = $last = null;
$wd = $fa ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
if ($g) {
    $d = new DateTime(sprintf('%04d-%02d-%02d', ...$g), new DateTimeZone('Asia/Tehran'));
    $lead = ((int)$d->format('w') + 1) % 7;
    for ($k = 0; $k < $lead; $k++) $cells .= '<span class="yc-day empty"></span>';
    for ($i = 0; $i < 31; $i++, $d->modify('+1 day')) {
        $gy = (int)$d->format('Y'); $gm = (int)$d->format('n'); $gd = (int)$d->format('j');
        [$jy, $jm, $jd] = tj_jalali($gy, $gm, $gd);
        if ($jm !== $m) break;
        $o = tj_occasions_on($gy, $gm, $gd);
        $holiday = (bool)array_filter($o, function ($x) { return $x['holiday']; });
        $off = $holiday || (int)$d->format('w') === 5;
        $cls = 'yc-day' . ($off ? ' off' : '') . ($m === $todayM && $jd === $todayD ? ' today' : '');
        $cells .= '<span class="' . $cls . '"' . ($o ? ' title="' . tj_h(implode(' · ', array_map(function ($x) { return $x['title']; }, $o))) . '"' : '') . '>' . $n($jd) . '</span>';
        foreach ($o as $x) $occ[] = [$jd, $x['title'], $x['holiday']];
        $labels = tj_day_labels([$gy, $gm, $gd], $fa);
        if ($first === null) $first = $labels;
        $last = $labels;
    }
}
$occHtml = $occ ? '<ul class="today-occasions yc-occ">' . implode('', array_map(function ($o) use ($n, $monthName, $m, $fa) {
    return '<li' . ($o[2] ? ' class="holiday"' : '') . '><b>' . $n($o[0]) . ' ' . tj_h($monthName($m)) . '</b> — ' . tj_h($o[1]) . ($o[2] ? ' <span class="today-tag">' . ($fa ? 'تعطیل' : 'holiday') . '</span>' : '') . '</li>';
}, $occ)) . '</ul>' : '';
$name = $monthName($m);
$Y = $n($thisYear);
$range = $first ? ($fa ? "{$first['jalali']} برابر با {$first['gregorian']} و {$first['hijri']} است و {$last['jalali']} برابر با {$last['gregorian']}."
    : "{$first['jalali']} is {$first['gregorian']} ({$first['hijri']}); {$last['jalali']} is {$last['gregorian']}.") : '';
$prev = $m > 1 ? $m - 1 : 12; $next = $m < 12 ? $m + 1 : 1;
$nav = '<p class="yc-years"><a href="/' . $lang . '/calendar/' . TJ_MONTH_SLUGS[$prev - 1] . '/">' . tj_h($monthName($prev)) . '</a> · <b>' . tj_h($name) . '</b> · <a href="/' . $lang . '/calendar/' . TJ_MONTH_SLUGS[$next - 1] . '/">' . tj_h($monthName($next)) . '</a> · <a href="/' . $lang . '/calendar/months/">' . ($fa ? 'همه‌ی ماه‌ها' : 'All months') . '</a></p>';

$main = $nav
    . '<p class="yc-lead">' . ($fa
        ? "{$name} " . TJ_ORDINALS_FA[$m - 1] . " ماه سال شمسی است، " . $days($m) . " روز دارد و از ماه‌های " . $season($m) . " است. {$range}"
        : "{$name} is month {$m} of the Persian (Solar Hijri) year, with " . $days($m) . " days, in " . $season($m) . ". {$range}") . '</p>'
    . '<section class="yc-month"><h2>' . tj_h($name . ' ' . $Y) . '</h2><div class="yc-grid" role="grid" aria-label="' . tj_h($name . ' ' . $Y) . '">'
    . implode('', array_map(function ($w) { return '<span class="yc-wd">' . $w . '</span>'; }, $wd)) . $cells . '</div>' . $occHtml . '</section>'
    . '<h2>' . ($fa ? "معنی نام {$name}" : "What {$name} means") . '</h2><p>' . tj_h($info[$fa ? 0 : 1]) . '</p>'
    . '<h2>' . ($fa ? "برج {$name} (نماد ماه تولد)" : "Zodiac sign of {$name}") . '</h2><p>' . ($fa
        ? 'ماه‌های تقویم شمسی با برج‌های دوازده‌گانه هم‌ترازند، چون سال با ورود خورشید به برج حمل شروع می‌شود. برج ' . tj_h($name) . ' «' . tj_h($info[2]) . '» است.'
        : 'Persian months line up with the twelve zodiac signs, since the year starts when the Sun enters Aries. The sign of ' . tj_h($name) . ' is ' . tj_h($info[3]) . '.') . '</p>'
    . '<h2>' . ($fa ? "جشن‌های {$name}" : "Festivals in {$name}") . '</h2><p>' . tj_h($info[$fa ? 4 : 5]) . ($fa
        ? ' در گاه‌شماری کهن ایرانی هر روز ماه هم نامی داشت؛ روزی که نامش با نام ماه یکی می‌شد، جشن گرفته می‌شد.'
        : ' In the old Iranian calendar every day of the month had a name too; the day whose name matched the month\'s was a feast.') . '</p>'
    . '<p class="today-cta"><a class="btn btn-primary" href="/' . $lang . '/calendar/#m' . $m . '">' . ($fa ? "تقویم کامل {$Y}" : "Full calendar {$thisYear}") . '</a> '
    . '<a class="btn btn-ghost" href="/demo/">' . ($fa ? 'برنامه‌ریزی روزهات با توجیبی' : 'Plan your days in Toojibee') . '</a></p>';

$faq = $fa ? [
    ["ماه {$name} چند روز است؟", "{$name} " . $days($m) . ' روز دارد.'],
    ["{$name} {$Y} از چه روزی شروع می‌شود؟", $first ? "یکم {$name} {$Y} برابر با {$first['weekday']} {$first['gregorian']} است." : ''],
    ["برج ماه {$name} چیست؟", "برج {$name}، {$info[2]} است."],
] : [
    ["How many days does {$name} have?", "{$name} has " . $days($m) . ' days.'],
    ["When does {$name} {$thisYear} start?", $first ? "1 {$name} {$thisYear} is {$first['weekday']}, {$first['gregorian']}." : ''],
    ["What is the zodiac sign of {$name}?", "The sign of {$name} is {$info[3]}."],
];
$faq = array_values(array_filter($faq, function ($q) { return $q[1] !== ''; }));
$slugM = TJ_MONTH_SLUGS[$m - 1];
tj_render_page([
    'lang' => $lang, 'path' => "/$lang/calendar/$slugM/", 'alt' => ['fa' => "/fa/calendar/$slugM/", 'en' => "/en/calendar/$slugM/"],
    'title' => $fa ? "تقویم {$name} {$Y}: مناسبت‌ها، تعطیلات، برج و جشن‌های {$name} | توجیبی" : "{$name} {$thisYear}: Persian calendar month, holidays and festivals | Toojibee",
    'desc' => $fa ? "تقویم {$name} {$Y} با تاریخ میلادی و قمری، مناسبت‌ها و تعطیلات رسمی؛ معنی نام {$name}، برج {$info[2]} و " . trim(preg_split('/[؛(]/u', $info[4])[0]) . '.'
        : "The {$name} {$thisYear} calendar with Gregorian and Hijri dates, occasions and holidays; what {$name} means, its sign ({$info[3]}) and its festivals.",
    'h1' => $fa ? "تقویم {$name} {$Y}" : "{$name} {$thisYear} (Persian calendar)",
    'main' => $main, 'faq' => $faq, 'class' => 'month-page',
    'crumbs' => [[$fa ? 'تقویم' : 'Calendar', "/$lang/calendar/"], [$fa ? 'ماه‌ها' : 'Months', "/$lang/calendar/months/"], [$name, "/$lang/calendar/$slugM/"]],
]);
