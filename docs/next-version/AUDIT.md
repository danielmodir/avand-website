# گزارش اولیهٔ معماری و وضعیت محصول

تاریخ ۲۰۲۶-۱۱-۱۵؛ کد مبنا `927f48a`، شاخهٔ آغاز بررسی `master` با upstream `origin/master`. این گزارش وضعیت کد لوکال است؛ وضعیت واقعی هاست، دیتابیس تولید و سرویس‌های خارجی مشاهده نشده است.

## نتیجهٔ اصلی

توجیبی از صفر شروع نمی‌شود: برنامه‌ریزی، عادت، تقویم، چرخه، دوستان و گروه، مقالات، پنل مدیریت، ذخیرهٔ آفلاین و Android دارای کد واقعی‌اند. بااین‌حال، وجود این زیرساخت‌ها با تکمیل نیازمندی نسخهٔ بعد فرق دارد. فروشگاه و اتصال AI در UI غیرفعال‌اند؛ پرداخت، میزکار دانشگاه/باشگاه/مالی، چت‌بات و ربات SEO سیستم کامل موجود ندارند.

بزرگ‌ترین پیش‌نیاز، حفظ داده و هماهنگی قراردادهای PHP/Django/دو کلاینت است. بازنویسی با چارچوب جدید یا انتقال هاست برای انجام این کار لازم تشخیص داده نشده است. توسعهٔ قابلیت در این مرحله انجام نشده است.

## روش بررسی و شواهد

- شروع از `docs/CHANGES.md`، سپس AGENTS، READMEهای ریشه/وب/بک‌اندها/Android/دیتابیس، SPEC و DEPLOY و کدهای مربوط؛ اسناد قدیمی با کد تطبیق داده شدند.
- بررسی مسیرهای ورود، پیکربندی، state/render/فرم/تاریخ، کلاینت‌ها، routerها، مدل‌ها، Migrationها، sync، مجوزهای گروه، اعلان/worker/Android، OAuth/MCP، مقالات/پنل و مسیرهای SEO.
- استخراج فهرست APIها، ۴۷ مدل concrete اختصاصی Django، فیلدها، ارتباط‌ها، جدول‌های PHP و صفحه‌ها در [TECHNICAL_INVENTORY](TECHNICAL_INVENTORY.md). این فهرست بدون query دیتابیس تولید شده است.
- اجرای تست‌های موجود، بررسی drift مدل/Migration و دو probe محدود برای منطق ادغام sync. نتیجه و محدودیت‌ها در [TEST_REPORT](TEST_REPORT.md).
- مشاهدهٔ کد، بررسی static و تست واحد به‌جای penetration test یا تست عملی تمام مسیرهای کاربر گزارش نشده‌اند. مسیرهای اصلی بررسی شده‌اند؛ ادعای خواندن خط‌به‌خط همهٔ دارایی‌ها، APKها یا کل فایل‌های تولیدشده وجود ندارد.

## ساختار و تکنولوژی

| مسیر | نقش و وضعیت مشاهده‌شده |
|---|---|
| `frontend/` | خروجی static قابل انتشار؛ HTML/CSS/vanilla JS، فونت Baloo Bhaijaan 2 محلی، fa/en. GitHub Pages فقط همین پوشه را می‌گیرد. |
| `frontend/demo/` | برنامه با scriptهای classic در global scope، partialهای component، state مشترک، localStorage/sessionStorage، دو API adapter، PWA service worker. ترتیب بارگذاری اهمیت دارد. |
| `frontend/demo/js/core/` | تاریخ‌های جلالی/میلادی/قمری، تکرار، عادت/تایمر، اعلان، جستجو، backup/ICS، گروه، onboarding، template، کارت اشتراک و آمار opt-in. |
| `frontend/demo/components/` | ۱۸ پوشهٔ component، از جمله workspace، calendar، items، popup، menu، period، groups، auth و articles؛ فهرست دقیق در inventory. |
| `backend-php/` | API PHP/PDO، JSON document sync، auth، social/group، push، MCP، content/articles و پنل ادمین؛ هدف هاست اشتراکی طبق مستندات. |
| `backend/` | Django 5.2 + DRF؛ شش ماژول داده و common؛ محیط نصب‌شده Django 5.2.18 و DRF 3.16.1؛ هنوز منتشرنشده طبق docs. |
| `database/` | راه‌اندازی MySQL ماژولار برای Django؛ نمایندهٔ مستقیم دیتابیس فعلی PHP نیست. |
| `android/` | Kotlin و Android SDK بدون کتابخانهٔ UI خارجی؛ WebView، bridge محدود، offline/OTA، AlarmManager، widget، share و قفل اپ. |
| `backend-php/panel/` | پنل اصلی PHP، در root پوشه‌ای به نام `panel/` وجود ندارد؛ ارجاع کوتاه قدیمی باید در این مسیر خوانده شود. |
| `deploy/` | بسته‌بندی سایت/APK و ساخت دارایی؛ build-site-zip شامل PHP و minify با esbuild است، برخلاف ساده‌سازی برخی متن‌های قدیمی «بدون build». انتشار خام frontend همچنان ممکن است. |
| `.github/workflows/pages.yml` | هر push به master به انتشار GitHub Pages منجر می‌شود؛ کنترل تغییر GitHub از کنترل هاست اصلی جداست. |
| `tests/` | سه فایل Node، ۱۴ تست backup/date tools/prayer. |
| `docs/` و گزارش‌های ریشه | مشخصات و تاریخچهٔ چند نسل محصول؛ برخی ادعاها قدیمی‌اند. `docs/next-version/` مرجع مدیریت این آپدیت است. |
| `dist/` و خروجی‌های build | خروجی تولیدی؛ مبنای طراحی یا محل اصلاح دستی نیستند. |

نسخهٔ asset برنامه `2026-10-27.15`؛ PHP schema v24؛ Android `1.4.0 (5)`، minSdk 24 و target/compile 34. آخرین Migrationهای دیسک: core `0009_mcp_key`، planning `0008_event_color`، social `0003_group_admins`، notifications `0003_notices`، calendar_data `0002_load_data`، period `0001_initial`. نسخهٔ core در CHANGES قبلاً 0008 ثبت شده بود و در این بررسی تصحیح می‌شود؛ هیچ Migration جدیدی ساخته نشده است.

## سه حالت اجرای متفاوت

1. لوکال static و GitHub Pages: `config.js` آدرس API را خالی می‌گذارد؛ اطلاعات روی دستگاه و ورود واقعی غیرفعال. مقاله‌های PHP و قابلیت‌های نیازمند حساب در این حالت قابل اثبات نیستند.
2. دامنهٔ `toojibee.ir`: تنظیمات کد `backend: php` و `/api/v1` را انتخاب می‌کند. نوع واقعی دیتابیس سرور از مخزن معلوم نیست؛ bootstrap از config یا SQLite fallback استفاده می‌کند.
3. سرور لوکال Django: `config/local_frontend.py` تنظیمات برنامه را به API لوکال وصل می‌کند. موفقیت این حالت به معنی آماده‌بودن همان قابلیت در PHP نیست.

Android فایل‌های app را از مسیر origin خود پروژه با cache محلی ارائه می‌کند و API شبکه‌ای را به origin پروژه می‌فرستد. تغییر JS/CSS می‌تواند با OTA برسد؛ تغییر bridge/scheduler نیاز به APK دارد و باید با APKهای قدیمی سازگار بماند.

## ساختار دیتابیس و ارتباط‌ها

### PHP

یک دیتابیس PDO انتخاب می‌شود، نه شش دیتابیس Django. `tj_users` والد session/token، سند کاربر، ارتباطات، push، گروه و MCP است. `tj_user_data` یک سند نسخه‌دار شامل profile/settings/tasks/habits/events/period نگه می‌دارد؛ period در ذخیرهٔ سرور رمز می‌شود. این بخش جدول task/habit/event مستقل ندارد.

گروه‌ها رابطه‌ای‌اند: group → members و items → marks؛ انجام شخصی/مشترک از `done_mode` می‌آید. `tj_period_shares` بین owner/viewer است. مقاله‌ها، slugهای قبلی، محتوا، شروع ماه قمری، notice، پیام پشتیبانی، ادمین/session/audit نیز جدول‌های مجزا دارند. متن مقاله و دادهٔ reference در فایل‌های محلی seed هم وجود دارد.

Migrationهای v1..v24 داخل `lib/bootstrap.php` اجرا می‌شوند. بعضی ALTERهای قدیمی هر PDOException را به‌عنوان «قبلاً وجود دارد» نادیده می‌گیرند؛ برای تغییرات آینده لازم است خطاهای واقعی پنهان نشوند، migration کنترل‌شده و قابل بازیابی باشد. تعویض driver/config به‌تنهایی انتقال دادهٔ SQLite به MySQL نیست.

### Django

- **core/default:** User → Profile، UserSettings، OAuthAccount، AuthSession/AuthToken/AuthEvent، UserModule، StoredFile، consent و MCP key؛ content/legal/release/email/support نیز اینجا هستند.
- **planning:** Category → Task؛ Task.parent یک سطح subtask؛ TaskOccurrence و TaskException، attachment با شناسهٔ فایل؛ Habit → HabitLog؛ Event → EventException. base modelها version، زمان تغییر و soft-delete دارند.
- **calendar:** Occasion با source/admin و سه تقویم؛ HijriMonthStart با تاریخ واقعی/پیش‌بینی.
- **period:** PeriodUserKey → profile/cycles رمز‌شده؛ envelope encryption با کلید per-user و KEK خارج DB.
- **social:** Connection/Invite/Redemption/Report و Group → GroupMember/GroupItem → GroupMark.
- **notifications:** subscription، preference/quiet hours، module mute، scheduled push/log و notice/recipient.

روابط درون یک دیتابیس FK دارند. user/file ID میان ماژول‌ها معمولاً UUID scalar است؛ `config/routers.py` رابطهٔ میان دیتابیس‌ها را نمی‌پذیرد. بنابراین عملیات سراسری حذف حساب/پاکسازی نیازمند jobهای purge/orphan است و transaction اتمیک سراسری فرض نمی‌شود. تست SQLite این routing را می‌آزماید، نه تمام رفتار MySQL تولید را.

## APIها و اختلاف قراردادها

فهرست مسیر/متد/handler در inventory آمده است. گروه‌های اصلی عبارت‌اند از auth/session/profile/settings/module/files، planning، period، social/groups، calendar، notification/push، MCP، support/notices و PHP admin/content/articles.

| موضوع | PHP | Django | اثر در توسعه |
|---|---|---|---|
| برنامه‌ریزی | GET/PUT `/sync`، یک سند کامل با version | `/planning/sync` و PUT/DELETE هر رکورد با version | نیاز به قرارداد مشترک در سطح Cloud؛ endpointها یکسان نیستند |
| Google | `/auth/providers` صریحاً google=false | start/callback/exchange و دریافت ID token | پیاده‌سازی فعلی Django آمادهٔ استفاده روی هاست PHP نیست |
| تکرار | JSON آزاد در سند | rec_mode/interval/weekdays/until/anchor/calendar و exception مدل‌شده | `api.js` rec_until را نگاشت نمی‌کند؛ UI موتور کامل مدل را مصرف نمی‌کند |
| مقاله | API، پنل، جدول و صفحات عمومی PHP | مدل/API اختصاصی Article پیدا نشد | دامنهٔ واقعی «موجود» وابسته به بک‌اند است |
| مناسبت ادمین | تغییر شروع ماه قمری؛ CRUD مناسبت عمومی پیدا نشد | Occasion + admin و API calendar | قمری با مناسبت شخصی/باستانی یکی نیست |
| حذف حساب | حذف مستقیم با password در PHP | grace/purge در Django | رفتار نهایی باید حفظ/مستند و یکسان‌سازی بررسی شود |
| ثبت‌نام بدون کد | تنظیم ادمین موجود | همان استثنا پیاده نشده طبق CHANGES و مسیرها | تفاوت رفتار عمدی موجود باید در تست قرارداد ثبت شود |
| اعلان | صف push و cron | ScheduledPush و management command | نیاز به اثبات پیکربندی و سرویس واقعی، نه صرف وجود endpoint |

## تطبیق پانزده بخش درخواستی

«موجود» در جدول، مشاهدهٔ کد است، نه Approved.

| # | بخش محصول | وضع فعلی | شواهد/کار نسخهٔ بعد |
|---|---|---|---|
| 1 | میزکار اصلی | موجود، نیازمند تغییر | planning desk؛ events/tasks/habits جدا و به همین ترتیب؛ NV-01 |
| 2 | دانشگاهی | جدید به‌عنوان میزکار | template مطالعه و exam countdown موجود، میزکار تخصصی نیست؛ NV-02-01 |
| 3 | مدیریت زمان | ناقص/پراکنده | ساعت شروع/پایان، overdue و habit timer؛ دامنهٔ صفحه در D07؛ NV-13-01 |
| 4 | عادت‌ها | منطق موجود، میزکار مستقل ندارد | log، tick، count/timer، تکرار؛ NV-02-10 |
| 5 | باشگاه | جدید | مدل/صفحهٔ تخصصی پیدا نشد؛ NV-02-02 |
| 6 | مالی | جدید | درآمد/هزینه/budget/report/billing موجود نیست؛ NV-02-03 تا 09 |
| 7 | چرخه | موجود | period component، encrypted server data، sharing/localOnly/lock؛ NV-02-11 |
| 8 | مقالات | در PHP موجود | articles component، پنل نویسنده/بازبین و صفحات عمومی؛ NV-11 |
| 9 | دوستان/اجتماعی | موجود، همکاری پیشرفته ناقص | ارتباط، دعوت، بلاک، گروه و تیک مشترک؛ NV-10 |
| 10 | مدیریت میزکارها | جزئی | deskKeys/MAIN_DESKS، تنظیمات نمایش و mainDesk؛ registry عمومی کامل نیست؛ NV-12-05 |
| 11 | جستجو | جزئی | `search.js` مناسبت‌های سال آینده و عنوان ایونت؛ جستجوی جامع داده نیست؛ NV-13-02 |
| 12 | چت‌بات | جدید | MCP ابزار برنامه‌ریزی دارد؛ چت‌بات/شخصیت/مدل provider ندارد؛ NV-08 |
| 13 | فروشگاه | UI نمایشی غیرفعال | `FEATURES.store=false`، کارت locked/upgrade، بدون پرداخت؛ NV-07 |
| 14 | پروفایل | موجود | اطلاعات کاربر، پشتیبانی، ابزار تاریخ، backup، آموزش و دوستان؛ NV-12 |
| 15 | تنظیمات | موجود، توسعه لازم | زبان، calendar، هفته، mode/palette، notification، desk prefs؛ NV-13-04 |

میز مناسبت‌ها و میز گروه‌ها نیز واقعاً موجودند و با ساختار جدید نباید حذف شوند. جدول بالا فهرست خواسته‌شده را تطبیق می‌دهد، نه اینکه قابلیت‌های اضافهٔ فعلی را از محصول خارج کند.

## جزئیات قابلیت‌های موجود/ناقص

- `renderTasksSection` بر اساس pinned و done مرتب می‌کند، نه اولویت زمان. `renderItemSections` سه بخش جدا دارد. مسیر اصلی تغییر NV-01 همین است.
- `date-picker.js` Drag تاریخ را واقعاً دارد. در `popup.js:submitPopup` ترکیب بازهٔ چندروزه و تکرار با `rangeNoRepeat` رد می‌شود. `occursOnDate` برای interval/weekdays سقف پایان تکرار را اعمال نمی‌کند؛ habit endDate جداگانه دارد.
- رویداد جدید گذشته در فرم ممنوع است، مگر birthday؛ Django date field به‌تنهایی این ممنوعیت UI را ایجاد نمی‌کند. هنگام آزادسازی، اعلان گذشته نباید فوراً انبوه اجرا شود.
- روز شروع هفته قابل انتخاب است، ولی لیست weekend مستقل نیست. `isHolidayOn` به مناسبت تعطیل dataset و preferences وابسته است.
- تایمر/شمارندهٔ عادت و overdue reminder تسک وجود دارند؛ این‌ها قرارداد آلارم پایان مدت قابل توقف یا DND هر Habit نیستند. Undo عمومی ۵ثانیه‌ای پیدا نشد.
- theme از mode × palette تشکیل شده، اما classic/toojibee در چند محل hardcode شده‌اند؛ رجیستری مناسب دو تم جدید لازم است. رنگ‌های خامی مانند `ITEM_COLOR_CHOICES` و `THEME_COLOR` بیرون tokens وجود دارند.
- share link تسک/عادت/ایونت نسخهٔ کپی در fragment می‌سازد؛ share-card عکس می‌سازد. این‌ها اشتراک زنده با ACL نیستند. دادهٔ داخل لینک کپی در دست هر دریافت‌کنندهٔ لینک قابل خواندن است.
- گروه فعلی owner/admin/member، done_mode و mark دارد؛ assignee و workflow سوپرگروه تعریف‌شده ندارد.
- مقاله از صفر لازم نیست: draft → pending → published/rejected، دسته، placement و old slug موجود است. تفاوت PHP/Django و امکانات مدنظر باید روشن شود.
- بخش عمومی شامل `/fa/` و `/en/`، about/contact/download/guide/privacy/terms، chooser/404؛ روی PHP علاوه بر آن مقاله، today، calendar سال/ماه، convert و world-clock و sitemap پویا وجود دارد. `/demo/` و پنل باید noindex بمانند.
- ابزار SEO هوشمند، Search Console/GA adapter و گزارش ارگانیک موجود نیست. فایل verification Google یا آمار بازدید داخلی به معنی اتصال به این سرویس‌ها نیست.

## ریسک‌ها و بدهی‌های فنی

Severityها اولویت فنی پیشنهادی هستند. «مشاهده‌شده» با «نیازمند بررسی» جدا شده؛ هیچ اصلاحی در این مرحله انجام نشده است.

| ID | اولویت / اعتبار | شاهد و اثر | پیگیری |
|---|---|---|---|
| R01 | P0 / مشاهده و probe | `api-php.js:mergeFromServer` فقط IDهای غایب را اضافه می‌کند؛ ویرایش جدید سرور برای ID موجود نادیده می‌ماند و flush سند محلی را دوباره می‌فرستد. تعارض می‌تواند ویرایش دستگاه دیگر را از بین ببرد. | NV-00-02، D22؛ merge/version/tombstone پایدار |
| R02 | P0 / مشاهده و probe محدود | `deleted = {}` فقط در حافظهٔ session است. پس از restart، آیتم حذف‌شدهٔ محلی ممکن است در merge با سرور دوباره اضافه شود. این probe تابع است، نه تست سراسری چند دستگاه. | NV-00-02/05؛ حذف پایدار و سناریوی چنددستگاهی |
| R03 | P0 / مشاهدهٔ کد | `sync.php` عمدتاً نوع section و حجم کل را بررسی می‌کند؛ برای جزئیات هر task/habit/event قرارداد schema سروری کامل ندارد. نباید entitlement یا ACL جدید را به سند قابل‌نوشتن کاربر سپرد. | NV-00-03/04؛ validation و دادهٔ حساس server-owned |
| R04 | P1 / مشاهدهٔ کد | `api.js` مقدار rec_until را رفت‌وبرگشت نمی‌دهد؛ فرم و occurrence engine همهٔ امکانات مدل Django را مصرف نمی‌کنند. | NV-01-08/09، NV-03-05؛ contract test |
| R05 | P1 / مشاهدهٔ کد | `PUSH_DAYS=7`، refresh برنامه‌محور؛ Android نیز همان لیست را مصرف می‌کند. پس از افق صف و بدون باز شدن/تجدید، تداوم اعلان قابل وعده نیست. | NV-04-04/06-05؛ scheduler و renewal واقعی |
| R06 | P1 / مشاهدهٔ کد | Migration PHP در درخواست راه‌اندازی اجرا می‌شود؛ بعضی catchها خطای ALTER را نادیده می‌گیرند. یک config جدید هم انتقال داده انجام نمی‌دهد. | NV-00-04؛ dry run، backup/restore، خطای آشکار، migration دو driver |
| R07 | P1 / نیازمند security review | Google OAuth دارای signed state/nonce است، ولی state در این فایل به مرورگر آغازکننده bind نشده و exchange از cache get/delete استفاده می‌کند. `_allowed_next` نیز prefix دارد. بررسی CSRF/replay/race و parse دقیق origin/path قبل از فعال‌سازی لازم است؛ exploit تولید اثبات نشده. | NV-06-01/02، NV-00-05 |
| R08 | P1 / مشاهدهٔ کد | MCP یک کلید با اختیارات گستردهٔ برنامه‌ریزی و URL شخصی دارد؛ scopes میزکار/خواندن/نوشتن مجزا دیده نشد. کلید در URL می‌تواند در مسیر اشتراک/لاگ افشا شود. period فعلاً عمداً خارج است. | NV-08-03؛ scope، revoke، redaction و consent |
| R09 | P1 / مشاهدهٔ معماری | scriptهای global، state مشترک و render/handler بزرگ در menu/popup/app؛ افزودن میزکارها بدون مرزبندی coupling را افزایش می‌دهد. | NV-02-13؛ استخراج تدریجی منطق بدون بازنویسی چارچوب |
| R10 | P1 / محدودیت شواهد | تست خودکار PHP در مخزن مشاهده نشد و PHP CLI روی PATH نیست؛ ۱۴ JS و ۷۶ Django پوشش end-to-end همهٔ قابلیت‌ها نیستند. | NV-00-05؛ PHP local isolated و contract/E2E |
| R11 | P1 / مشاهدهٔ دادهٔ محلی | رمزگذاری period سمت سرور به معنی رمزگذاری localStorage یا JSON backup نیست. localOnly و export نیاز به حفظ رضایت/پاکسازی/logout صحیح دارند. | NV-02-11، NV-00-06؛ privacy regression |
| R12 | P2 / مشاهدهٔ کد | theme/token در چند محل پخش و بعضی رنگ‌ها خام‌اند؛ دو تم جدید با افزودن دو فایل CSS به‌تنهایی کامل نمی‌شوند. | NV-05-04/08 |
| R13 | P1 / مشاهدهٔ workflow | push به master GitHub Pages را منتشر می‌کند، حتی اگر تغییر فقط docs باشد. | NV-00-07؛ شاخهٔ review جدا، بدون merge/deploy |
| R14 | P1 / مشاهدهٔ اختلاف docs | core migration در CHANGES قدیمی؛ READMEها بعضاً پیش از PHP live، push و مقالات نوشته شده‌اند. | inventory و map جدید؛ اصلاح هدفمند مستندات |
| R15 | P1 / نیازمند بررسی عملی | انتشار خام GitHub Pages، PHP rendered pages و بستهٔ minify/OTA یک خروجی یکسان نیستند؛ page budget، CSP، bridge و cache باید روی خروجی واقعی آزموده شوند. | NV-00-06 و NV-09-10؛ هیچ build/deploy در این audit |

حفاظت‌های موجود هم قابل بازاستفاده‌اند: tokenهای hash‌شده/rotation، کنترل owner/role گروه‌ها، پنل با session cookie/CSRF و audit، whitelist مقصد Web Push، رمزگذاری period، app bridge محدود به origin و file access بسته. این‌ها در کد مشاهده شدند؛ گزارش، گواهی امنیت کامل یا پیکربندی درست سرور نیست.

## محدودیت‌های واقعی اعلان، Google و SEO

- مرورگر: worker فرایند دائمی نیست؛ اجرای تایمر صفحه در حالت بسته قابل اتکا نیست. سیستم فعلی از Push server و SW استفاده می‌کند، ولی تحویل به مجوز، شبکه و سرویس push وابسته است. [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- Android: AlarmManager مستقل از عمر UI عمل می‌کند؛ exact alarm در نسخه‌های جدید به مجوز/شرایط سیستم وابسته است. کد فعلی با نبود مجوز به alarm غیر دقیق fallback دارد؛ آزمون revoke/reboot/force-stop/محدودیت باتری لازم است. [Android alarms](https://developer.android.com/develop/background-work/services/alarms)
- صدای Android باید با channel طراحی شود؛ رفتار صوتی channel پس از ایجاد توسط برنامه قابل تغییر آزاد نیست و انتخاب کاربر در تنظیمات سیستم حاکم است. برای وب نیز انتخاب صدا نباید معادل تضمین صدای اعلان بسته معرفی شود. [Notification channels](https://developer.android.com/develop/ui/compose/notifications/channels)
- Google Calendar نیاز به اتصال مجاز، full/incremental sync، نگهداری sync token و رسیدگی به invalid token دارد؛ ICS import/export موجود، sync دائمی نیست. [Calendar incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync)
- Google sign-in در WebView باید با محدودیت embedded user-agent سازگار طراحی شود؛ مسیر بازگشت امن از مرورگر سیستم به حساب اپ لازم است. [Google OAuth native-app guidance](https://developers.google.com/identity/protocols/oauth2/native-app)
- ایندکس واقعی را از وجود sitemap نتیجه نمی‌گیریم؛ URL Inspection به مجوز Search Console و property مربوط نیاز دارد. هیچ دادهٔ ارگانیک یا رتبهٔ واقعی در این audit استخراج نشده است. [URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)

این منابع در روز بررسی خوانده شدند؛ Context7 نیز برای Android استفاده شد. هیچ کتابخانهٔ frontend به پروژه افزوده نشد. قانون صفر درخواست خارجیِ صفحات عمومی برقرار است؛ push و OAuth نیازهای زیرساختی جدا دارند و نباید به افزودن CDN/analytics script تعبیر شوند.

## کار بعدی قابل هماهنگی

پیشنهاد: ابتدا NV-00-02 تا 06 برای حفظ داده و قراردادها، همراه قرارداد میزکار/تکرار/تم؛ سپس میزکار اصلی و اعلان. سایر بسته‌ها طبق وابستگی، بدون حذف از دامنه، در IMPLEMENTATION_PLAN آمده‌اند. سؤال‌های محصول در DECISIONS ثبت شده‌اند. شروع توسعه، طراحی تم یا اتصال سرویس واقعی در این گزارش مجاز/انجام‌شده تلقی نمی‌شود.
