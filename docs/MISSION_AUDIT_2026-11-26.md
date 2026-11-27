# ممیزی جامع وضعیت توجیبی و نسخهٔ دمو

**تاریخ تکمیل:** ۲۰۲۶-۱۱-۲۷، Asia/Tehran (snapshot انتشار بررسی‌شده: ۲۶ نوامبر)  
**مبنای کد:** `6939d1e5f345a7f2c3f5821c820b865e173268b4` روی `codex/phase2-development-2026-11-22`  
**مبنای انتشار Pages مشاهده‌شده:** `ff1de50fdbff4c73cd0dd186ac739a06d92e7ffc`؛ نسخهٔ asset آنلاین `2026-11-22.6`  
**دامنه:** ممیزی کد جاری و تست‌های موجود؛ بدون تغییر قابلیت محصول یا دیتابیس و بدون اتصال به دادهٔ واقعی کاربران.

## روش و حدود اطمینان

ابتدا `docs/CHANGES.md`، دستورهای پروژه، READMEهای demo، PHP، Django و Android و مستندات `docs/next-version/` و `docs/phase2/IMPLEMENTATION_DESIGN.md` بررسی شدند. فایل‌های منبع وب، کلاینت‌ها، APIها، مدل‌ها و migrationهای فعلی برای تطبیق قابلیت‌های جدید خوانده شدند. گزارش معماری ۱۵ نوامبر در `docs/next-version/AUDIT.md` و چک‌لیست/تصمیم‌ها در همان پوشه مرجع سوابق قبلی‌اند؛ وضعیت مالی و دانشگاه آن گزارش قدیمی است و این سند آن دو را به‌روز می‌کند.

برچسب‌ها مطابق درخواست تعریف شده‌اند: **A** کامل و با آزمون عملی کافی؛ **B** کد پیاده‌سازی دارد ولی مسیر کامل عملی تأیید نشده؛ **C** بخشی پیاده است؛ **D** فقط UI/placeholder؛ **E** موجود ولی غیرقابل دسترس؛ **F** شواهدی از پیاده‌سازی یافت نشد؛ **G** جزئیات محصول باز است؛ **H** بیرون از دامنهٔ مصوب. کد موجود به‌تنهایی A نیست. این ممیزی، penetration test، audit رسمی امنیتی، تست چندکاربرهٔ محیط زنده یا تست واقعی دستگاه محسوب نمی‌شود.

### نمای مخزن و اجرا

| مورد | وضعیت مشاهده‌شده |
|---|---|
| مخزن/شاخه | `danielmodir/avand-website`؛ شاخهٔ فعال `codex/phase2-development-2026-11-22`، همگام با `origin` در آغاز بررسی؛ HEAD برابر commit بالا. |
| شاخهٔ انتشار | `origin/master` روی `927f48adae32630fecf94f1e723f52ddbd55a4a5` است؛ شاخهٔ کار چند commit و قابلیت مالی/دانشگاهی جلوتر است. Working tree از قبل سه تغییر خارج از این کار داشت: `.claude/launch.json`، `.playwright-cli/` و `deploy/mcp-relay-worker.js`؛ این ممیزی به آن‌ها دست نزد. |
| فناوری | سایت و اپ: HTML/CSS/JavaScript ساده؛ Android: Kotlin/WebView؛ API زندهٔ قراردادی: PHP/PDO؛ API دومِ توسعه: Django 5.2 + DRF؛ داده‌های Django برای هر ماژول DB جدا دارد. |
| ساختار | `frontend/` منتشر می‌شود؛ `frontend/demo/` پوسته و partialهای app است. `backend-php/` برای API دامنه، `backend/` Django منتشرنشده، `database/` راه‌اندازی MySQL، `android/` لایهٔ native، `deploy/` بسته‌سازی، `docs/` مستندات. |
| مسیرها | landing: `/`, `/fa/`, `/en/`; prototype: `/demo/`; PHP API طبق docs: `/api/v1/`; Django API: prefix `/api/v1/` روی سرور مستقل؛ Android WebView: `frontend/demo/`. |
| PHP/Django | دو API جدا و قراردادهای متفاوت‌اند: PHP planning را در سند `/sync` نگه می‌دارد؛ Django planning را per-record ذخیره می‌کند. PHP روی دامنه طبق README فعال است؛ نوع DB زنده از کد قابل اثبات نیست. Django طبق مستندات deploy نشده است. |
| ذخیره‌سازی/ورود | Pages/local static: `apiBase` خالی، بدون حساب واقعی، local storage روی همان مرورگر/دستگاه. `toojibee.ir`: تنظیم config به PHP API می‌رود. Django config برای محیط توسعه است. Android نسخهٔ WebView + bridge محلی. OAuth PHP در docs غیرفعال (`google:false`)؛ Django جریان Google در source است اما credentials/redirect عملی بررسی نشد. |
| آفلاین/همگام‌سازی | web بدون API local store دارد؛ PHP client سند versioned `/sync` و queue دارد؛ Android فایل‌های WebView را cache/OTA می‌کند. دادهٔ مالی با vault جدا و ciphertext محلی است؛ دانشگاه نیز cache/صف جدا دارد. همگام‌سازی واقعی بین چند دستگاه در PHP یا Android این ممیزی end-to-end نشد. |
| Navigation | component workspace، `deskKeys()` و `MAIN_DESKS`؛ میزهای planning، habit، finance، university، occasions، groups، period؛ دسترسی بر مبنای data/module/feature gating؛ مسیر UI دقیق هرکدام در جدول پایین. |
| Git/انتشار | Pages workflow فقط `frontend/` را منتشر می‌کند، با push به `master` یا `workflow_dispatch`. صفحات عمومی GitHub Pages و دامنه پاسخ 200 دادند؛ asset آنلاین قدیمی است. `gh auth status` نشان داد GitHub CLI در این محیط وارد نشده؛ workflow-dispatch/push انجام نشد. |
| Build/تست | frontend build-step اجباری ندارد؛ `deploy/build-site-zip.ps1` بستهٔ release و PHP را کنار هم آماده می‌کند. Node/Django/Android parser در این نوبت تست شدند؛ PHP CLI در PATH نبود. Android build parser check موفق بود، اما APK release یا نصب device انجام نشد. |

### شمارش وضعیت‌ها

برای شمارش، هر ردیف اصلی/زیرسیستم در ماتریس زیر یک واحد است؛ این شمارش ادعای شمارش تک‌تک کنترل‌های UI نیست. **۳۰ واحد** در ماتریس خلاصه شده: **A=0، B=15، C=8، D=1، E=0، F=6**. چهار ردیف هم برچسب G و یک ردیف H را به‌عنوان وضعیت تصمیم‌محور/خارج‌ازدامنه در کنار وضعیت اصلی دارند؛ بنابراین برچسب‌های مکمل **G=6، H=1** هستند و با جمع وضعیت اصلی جمع نمی‌شوند. صفر A عمدی و محافظه‌کارانه است: هیچ desk کاملی با حساب زنده، چنددستگاهی، خطا و دادهٔ واقعی end-to-end آزمایش نشد. تست واحد موفق، قابلیت‌های مشخص منطق را پشتیبانی می‌کند اما اثبات اجرای کل feature نیست.

## ماتریس قابلیت‌ها و شواهد

مسیرها به‌صورت کوتاه‌اند؛ پیشوند ریشه `frontend/demo/`، `backend-php/` یا `backend/` است. «نیاز بعدی» کار باقیمانده را نشان می‌دهد، نه مجوز اجرای آن.

| بخش / قابلیت‌های بررسی‌شده | وضعیت | UI / کد اصلی و ذخیره‌سازی | شواهد تست و نتیجه / کمبود |
|---|:---:|---|---|
| تقویم چندگانه، تاریخ شمسی/میلادی/قمری، ماه/سال، روز/هفته/ماه | B | `components/calendar/`, `js/core/dates.js`, `calendars.js`, `occasions.js`; دادهٔ تعطیلات محلی + API در صورت پیکربندی | تبدیل تاریخ/روزهای خاص در تست‌های Node موجود؛ مرور دستی همهٔ تاریخ‌های مرزی، ماه‌های رسمی قمری و refresh در چند view انجام نشد. |
| شروع هفته مستقل از آخر هفته؛ انتخاب چند روز تعطیل و label قابل دسترس | B | `components/menu/`, `js/core/weekends.js` یا preference/calendar implementation، `backend/apps/core/test_weekends.py`، `api-php` settings document، Django settings | تست Node مربوط به انتخاب چند روز و عدم تغییر week start و label غیررنگی PASS؛ ذخیره/بازیابی روی هر دو backend و render جامع بصری در این نوبت جداگانه تست نشد. |
| خط زمانی مشترک فعالیت‌های ساعت‌دار و حفظ ترتیب/pin فعالیت بی‌ساعت | B | `js/core/planning-timeline.js`, `workspace/workspace.js`, `components/day-sheet/` | تست Node `planning-timeline` PASS؛ پین/وضعیت انجام مورد بی‌ساعت در تست تابع پوشش دارد؛ استفادهٔ واقعی در هر نوع روز تقویم/برنامه عملیاتی کامل نشد. |
| Undo پنج‌ثانیه‌ای برای حذف و گزارش رویداد ادمین برای کاربر | F / G | undo عمومی پیدا نشد؛ audit admin برای تغییرات مدیریتی وجود دارد اما event log کاربر-محور هم‌معنا نیست | undo هنوز پیاده نشده؛ دامنهٔ دقیق Undo (حذف/تیک/ویرایش) در D03 باز است؛ اقدام بعدی تصمیم دامنه سپس design، بدون ساخت سیستم دوم. |
| یادآوری چندتایی/بازه‌ای، فاصلهٔ ساعت/دقیقه، انتهای inclusive، عبور نیمه‌شب | B | `js/core/notify.js`, `components/popup/`, `js/core/occasions.js`; PHP sync JSON، Django planning/calendar settings؛ Android `Reminders.kt` | تست‌های Node `reminder-window` و `occasion-reminders` موجود و پوشش cutoff/DST/overnight/ویرایش؛ Django در کل suite موفق؛ push تحویل واقعی، محدودیت صف ۷ روز و دستگاه واقعی تست نشد. |
| صدای اعلان سفارشی/شخصی‌سازی‌شده و هماهنگی همهٔ وضعیت‌ها | C / G | اعلان web/push/Android موجود؛ channel native و تنظیمات صدا محدود به سیستم‌عامل | فایل صوتی و صدای شخصی‌سازی‌شده یافت نشد. رفتار platform/browser یکسان یا تضمین‌شده نیست؛ طراحی/سیاست channel تصمیم‌محور است. |
| Sync دوطرفه Google Calendar، offline/retry/conflict، tombstone حذف پایدار، Trash با ماندگاری ۳۰روزه و backup سفارشی | C / G | backup/ICS: `js/core/backup.js`; sync: `api-php.js`, `api.js`, PHP `/sync`; Android local | backup/ICS و duplicate preview موجود؛ Google Calendar sync adapter یافت نشد. گزارش پیشین probe تعارض sync و tombstone محلی موقت را ثبت کرده (`docs/next-version/AUDIT.md`, R01/R02). Trash مدت‌دار/تنظیم‌پذیر پیدا نشد؛ restore/backup جامع چنددستگاهی تأیید نشده؛ D22 تعارض باز است. |
| مناسبت عمومی، dataset چندتقویمی و ماه قمری رسمی؛ مناسبت شخصی | C | `js/core/occasions.js`, `assets/data/occasions.json`, `hijri-months.json`, `components/birthday/`; Django `calendar_data`; PHP sync | dataset و reminders مناسبت opt-in موجود؛ Django calendar API/test دارد. چندکشوری، انتخاب کشور، category filter، باستانی/میراث مستقل، قالب سفارشی دسته، و یکتایی مناسبت شخصی=event کامل نیست یا در کد اثبات نشده. |
| ایونت: ساخت/ویرایش/تاریخ گذشته، repeat روزانه/هفتگی/ماهانه/سالانه/custom، exceptions/calendar basis | C | `components/popup/popup.js`, `js/core/dates.js`, `items.js`, `planning` APIs/models | گذشته برای birthday مجاز، رویداد عادی گذشته در فرم محدود؛ past event test موجود. مدل recurrence Django غنی‌تر از UI/API همسان است؛ محدودیت‌ها و تفاوت PHP JSON/Django در `docs/next-version/AUDIT.md` R04. قاعدهٔ آخر ماه/تقویم مبنا/یکپارچگی همهٔ الگوها کامل اثبات نشد. |
| ایونت: visibility بین planning/occasions، location دستی، meeting URL | B | popup، `event-visibility`, `event-location`, PHP sync JSON, Django planning migrations 0010/0011 | Node tests و Django tests مربوطه؛ لوکیشن فقط متن دستی، نقشه/coordinates/search وجود ندارد. پیوست رویداد و event دسته‌بندی خودکار/یادآوری بر اساس دسته پیدا نشد. فرم اصلی حفظ شده است. |
| تسک‌ها: CRUD، زمان/موعد، اولویت، status، بی‌ساعت، pin، subtasks و auto-complete parent | C | `components/items/`, `popup/`, `workspace/`; PHP sync document؛ Django `planning.Task`, `TaskOccurrence` | کد CRUD/tick/pin/subtask و API ownership وجود دارد؛ auto-complete و همهٔ ترکیب‌های membership پروژه+لیست در مرور E2E بررسی نشد. deadline مستقل از scheduled date، گزارش تاریخچه، فیلتر/مرتب‌سازی کامل و duplicate prevention cross-desk باید در سناریوها تأیید شوند. |
| پروژه، لیست، Kanban، پیشرفت و حفظ رابطهٔ تسک‌ها | F / G | repo از list/project model یا Kanban کامل خبر نمی‌دهد؛ templateها و گروه‌ها feature متفاوت‌اند | توسعهٔ پروژهٔ کامل بدون سند تصمیم جایز نیست؛ D07 دربارهٔ تعداد/نوع deskها باز است. ابتدا باید تمایز «لیست/پروژه/گروه» تثبیت شود. |
| Habit Tracker مستقل؛ روزانه/هفتگی/ماهانه، goal/streak/history/calendar و counter/timer | B | `components/workspace/workspace.js`, `js/core/habit-goals.js`, `trackers.js`, Django planning 0012, PHP sync JSON | تست‌های Node `habit-desk-separation`, `habit-goals`, `habit-goal-form` PASS؛ Django کل suite PASS. برنامه‌ریزی و عادت از رکوردهای موجود استفاده می‌کنند و Planning هبیت را رندر نمی‌کند. persistence زنده و app lifecycle هنوز E2E نیست. ارتباط با گروه در `groups.js` تا حدی وجود دارد. استراحت هوشمند/snooze/DND صریحاً H و در scope فعلی لازم نیست. |
| کیف پول، حساب/کارت، تراکنش دستی و انتقال | B | `js/core/finance.js`, `finance-vault.js`, `backend-php/lib/finance.php`, `backend/apps/finance/`, PHP schema v29+ / Django migrations | ledger خصوصی، Toman integer، تراکنش اتمیک، کارت بدون balance جدا و idempotency در source/docs؛ Django finance tests در full suite. این نشست PHP CLI/SQLite smoke را نتوانست مستقل تکرار کند؛ گزارش 26 نوامبر آن را PASS می‌داند. چندحساب/دوبارشماری و مالکیت live backend نیازمند E2E مستقل‌اند. |
| دستهٔ درآمد/هزینه، والد/فرزند، بودجه با دوره/rollover و preview پیامک بانک | B | `finance.js`, `finance-budgets.js`, `finance-vault.js`, `android/BankSms*.kt`, PHP v30–32, Django finance 0005–0006 | Node finance budget/vault test و Android parser check PASS؛ docs روز جاری: PHP lint/SQLite HTTP smoke، Django، matrix مرورگر PASS. پیامک فقط opt-in و draft؛ ثبت تراکنش پس از تأیید؛ Android اجازه/device/نمونهٔ واقعی sender هنوز نیازمند گوشی است. |
| تراکنش SMS dedupe، budgets period و refresh | B | API finance budget/category, encrypted local queue, fingerprint در SMS drafts | منطق idempotent در تست/کد؛ Android code path و API live end-to-end از این محیط قابل اثبات نیست. |
| قرض/بدهی/طلب، پس‌انداز و تخصیص مجازی، پرداخت دوره‌ای، full reports | F | هیچ endpoint/UI کامل در map جاری نیست؛ docs/CHANGES 26 Nov آن‌ها را باقی‌مانده می‌داند | گروه اول/دوم roadmap؛ نیازمند مدل مصوب (D06) پیش از تغییر داده. بودجهٔ فعلی معادل debt/savings نیست. |
| دانشگاه: dossier، دانشگاه/رشته، ترم، درس/اخذ مجدد/واحد، انتقال، GPA مصوب | B | `components/workspace/university*`, `js/core/university.js`, `university-gpa.js`, PHP `lib/university.php`, Django `apps/university/` + migration 0001 | تست Node GPA PASS؛ Django `university` tests در 115 PASS؛ گزارش 26 Nov PHP smoke و UI matrix را ثبت می‌کند. این نشست suite را روی SQLite مستقل اجرا کرد. پرونده‌ها و schema موجودند ولی کیفیت داده/مرز دسترسی live و migration هر دو بک‌اند در محیط واقعی تست نشدند. |
| دانشگاه: کلاس، برنامه، امتحان، تکلیف/تاریخ مهم، پیوست و نمایش گزینشی در Planning | C | university API records/resource/activity links به event/task مشترک | لینک‌های course-resource/activity به رکوردهای موجود برای جلوگیری از کپی در کد هستند؛ برنامهٔ کامل کلاس، تقویم دانشگاهی غنی، پیوست‌ها و visibility کامل هنوز در CHANGES باقی‌مانده‌اند. نمرهٔ نهایی و GPA مصوب در scope؛ حضورغیاب و میان‌ترم ریزدانه H. |
| Friends/connections, search username/TJ, invite, block/report, shared period | B | `components/groups/`, `js/core/groups.js`, `components/menu`, PHP `lib/social.php`, Django `apps/social/` | models/APIs/UI/tests موجود؛ Django social/group tests در suite PASS؛ PHP ownership/live two-user flows، invitation expiry و روی گوشی این نوبت عملی نشدند. period data sharing محدود/opt-in است؛ ACL مجزا از share link. |
| Groups: task/habit/event مشترک، owner/admin/member، mark، invite/join/leave | B | `js/core/groups.js`, `components/groups/`, PHP `lib/groups.php`, Django `apps/social/groups.py` | گروه موجود و تست API/permission Django پاس شده؛ تقسیم مسئولیت پیشرفته، supergroup، assignment، workflow وضعیت و تاریخچهٔ کامل هنوز طراحی/پیاده‌سازی نشده. |
| Social live shares با granular ACL؛ share link کپی و share cards | C | `items.js shareItemLink`, `share-card.js`, Django task-shares و adapterهای موجود | کپی item fragment و image cards موجود؛ این‌ها share زنده/ابطال دسترسی میزکار نیستند. URL کپی می‌تواند محتوا را در fragment به گیرنده نشان دهد. ACL پیشرفته و share desk باید جدا مدل شود. |
| Themes: palette × light/dark, storage migration, accessible states | B | `js/core/themes.js`, `css/themes.css`, settings/preferences, tokens | Node `themes.test.js` (contrast, palette equality, persistence, invalid values) PASS. مرورگر این ممیزی هر ۱۲ variant و زبان را تعاملی نگرداند؛ تغییر theme باید روی هر دو direction دوباره E2E شود. |
| Profile/security: account/profile, password reset, sessions/devices, logout/delete | C | `components/auth`, `components/menu`, PHP `lib/auth.php`; Django `apps/core/` | PHP و Django اختلاف قرارداد دارند؛ provider/callback live، recovery، revoke/session و حذف account هیچکدام با حساب واقعی در این بررسی اجرا نشدند. Django API کد بیشتری دارد؛ PHP طبق README امکانات session مدیریت‌شده محدودتر دارد. ادعای کامل‌بودن امنیت ممنوع. |
| Profile: backup, onboarding/tutorials/date tools, preferences, period privacy, articles | B | `js/core/backup.js`, `date-tools.js`, `onboarding.js`, `menu.js`; PHP content/articles/admin | backup/date tools تست واحد دارند؛ مقالات/پنل و تنظیمات در PHP implementation؛ Pages demo بدون API مقالات/حساب واقعی را نشان نمی‌دهد. خروجی backup شامل period فقط با opt-in؛ privacy/security live flow تست نشد. |
| Store/ads | D / H | `features.js`, `menu.js`, feature center/locked states؛ `FEATURES.store=false` | placeholder/قفل UI وجود دارد، پرداخت/اشتراک/entitlement server-side و تبلیغات واقعی وجود ندارد. فروشگاه درآمدزا تصمیم باز D12/D13؛ تبلیغات قابلیت تأییدشده نیست. |
| AI assistant/chatbot/Gemini/natural language | F / G | UI Connect to AI با flag disabled؛ MCP شخصی برای task/habit/event در PHP/Django (period عمداً بیرون) | chatbot، provider adapter و natural-language creation وجود ندارد. MCP موجود قابلیت integration با LLM بیرونی است و chatbot داخلی نیست؛ scope/consent/revoke و key URL risk نیازمند review؛ G طبق D14/D15. |
| Save bot, advanced sharing, profile customization | F / G | برای «سیو بات» و مفاهیم مبهم‌تر شواهدی از feature نهایی یافت نشد؛ share/copy موجود توصیف بالا | «Save bot» نام/رفتار مصوب و مستند ندارد؛ از روی اسم چیزی ساخته یا حدس زده نشود. |
| SEO bot, analytics connectors | F | sitemap/static metadata/PHP SEO pages؛ internal opt-in statistics، نه Search Console/GA/SEO bot | روبوت تحلیل SERP، keyword/recommendation، Search Console/GA adapter نیست. tracking خارجی برخلاف قانون zero-runtime است؛ D18/D19. |
| موارد خارج از درخواست که وجود دارند: prayer times/cities, date tools, ICS backup/import, onboarding/tutorial/templates, articles, PWA, widgets, share cards, MCP | B | source paths در `docs/CHANGES.md` code map و `frontend/demo/js/core/` | این قابلیت‌ها را حذف یا با نمونهٔ دیگری موازی نکنید؛ هر کدام دامنه و تست مستقل می‌خواهد. Prayer/time و widget روی گوشی واقعی این مأموریت بررسی نشدند. |

### تست‌هایی که در این نوبت اجرا شدند

| فرمان/روش | نتیجه |
|---|---|
| `node --test tests/*.test.js` | **69/69 PASS**؛ شامل budget/vault، reminder window، habit goals/separation، themes، weekend، event visibility/location، dates و timeline. این‌ها تست منطق‌اند، نه همهٔ مسیرهای browser. |
| `backend/.venv/Scripts/python.exe manage.py test apps --settings=config.settings.test --noinput` | **115/115 PASS**، 8 دیتابیس SQLite آزمایشی، system check بدون issue. برخی تست‌ها عمداً پاسخ 400/401/404 را لاگ کردند؛ suite در پایان OK. |
| `android/gradlew.bat :app:checkBankSmsParser` با `JAVA_HOME=C:\Program Files\Java\jdk-20` در همان process | **BUILD SUCCESSFUL**؛ parser test pass. Android build با Java env خراب اولیه اجرا نشد، سپس با JDK20 موفق شد؛ APK/device اجرا نشد. |
| local server + Playwright CLI روی `http://127.0.0.1:8123/demo/` | title/asset `2026-11-26.1` و محتوای تقویم بارگذاری شد؛ viewport 360 و 1280 overflow نداشت؛ resourceهای ثالث در `performance` صفر. این بررسی فقط بارگذاری/layout اولیه است و بازبینی همهٔ فرم‌ها، دو زبان و ۱۲ تم نیست. |
| URL عمومی | `https://danielmodir.github.io/avand-website/`, `/fa/`, `/en/`, `/demo/` و `https://toojibee.ir/demo/` پاسخ **HTTP 200**؛ public demo asset `2026-11-22.6`. هیچ دادهٔ حسابی در دمو ایجاد نشد. |
| PHP CLI/lint/SQLite smoke در همین محیط | **اجرا نشد**؛ `php` در PATH نیست. PHP smoke قبلی در log 2026-11-26 `docs/CHANGES.md` و `docs/next-version/TEST_REPORT.md` گزارش شده، اما این نوبت را مستقل تأیید نمی‌کنم. |
| Migration drift | **نامشخص در این نوبت**؛ فرمان درست در venv آغاز شد اما بیش از یک دقیقه بدون خروجی ماند و برای ادامهٔ کار متوقف شد. log روز 26 نوامبر در CHANGES نتیجهٔ قبلی را PASS می‌داند؛ این اجرا تأیید مستقل نیست. |
| محیط زنده، OAuth/Google، دادهٔ واقعی، رقابت sync دو دستگاه، اعلان Push/Web/Android، مجوز پیامک واقعی، restore، حذف حساب | **اجرا نشده**؛ برای جلوگیری از دسترسی/تغییر دادهٔ کاربران و به دلیل فقدان credentials/device. |
| Android APK release، APK signature، نصب، PWA install/service worker در دستگاه | **اجرا نشده**؛ فقط parser target پاس شد. |
| ماتریس کامل UI 360/1280 × fa/en × light/dark روی همهٔ deskها | گزارش CHANGES برای finance/university آن را PASS اعلام می‌کند؛ در این نوبت فقط layout اولیهٔ app را در دو عرض مشاهده کردم. مدرک ادعای گستردهٔ قبلی، run قابل بازتولید این نوبت نیست. |

## فهرست کارهای باقی‌مانده

### ۱) مصوب/قابلیت‌های تعریف‌شده ولی پیاده‌نشده یا اثبات‌نشده

- Sync واقعی Google Calendar، مدل sync token/حذف/تعارض و تدابیر idempotent؛ ICS فعلی را جایگزین sync نکنید.
- پروژه/لیست/Kanban اگر در محدودهٔ مصوب نهایی شد؛ وضعیت فعلی گروه و template برابر project desk نیست.
- مالی: قرض، بدهی/طلب، اهداف پس‌انداز و تخصیص مجازی، recurring dues و full reports. زیرساخت account/ledger/category/budget پیاده شده، نه همهٔ مدیریت مالی.
- دانشگاه: برنامهٔ کلاس/امتحان/تکلیف کامل، attachments/resource breadth و projection انتخابی در plan؛ dossier/terms/course/GPA foundation موجود است.
- Trash با نگهداری ۳۰ روزه و حذف قابل‌بازیابی؛ undo عمومی پنج ثانیه.
- اتصال زندهٔ چند دستگاه و backend parity، حذف پایدار و conflict policy.
- گزارش‌های کامل، recurrence سفارشی و last day/calendar basis در تمام adapterها.

### ۲) موجود ولی ناقص یا نیازمند رفع اثبات

- OAuth PHP مقابل Django، recovery/session/device management، account deletion و security flows؛ staging/live callback لازم است.
- Notification: تحویل وب/push/Android، بازهٔ ۷روزه، تغییر timezone/DST و exact alarm، صدا/channel؛ تست واقعی device/backend.
- recurrence: UI/model/API parity؛ منع range+repeat و رفتار tail/exception را با contract tests پوشش دهید.
- PHP migration/error behavior و syntax/live smoke با محیط PHP واقعی؛ Django DB tests جایگزین PHP/production MySQL نیست.
- Social/group: تست دو حساب واقعی و مدیریت invite، role changes، revoked access و سناریوی leave/delete.
- Financial/university API parity، owner isolation، encrypted offline queue retry، import/export، error recovery و idempotency پس از reload.
- app/profile/settings و theme matrix روی دستگاه/browser؛ تست responsive هر فرم و زبان، نه فقط shell.

### ۳) نیازمند تصمیم محصول

- D03 Undo/DND/آلارم پایان؛ D04 دانشگاه (برای گسترش beyond foundations)؛ D05 باشگاه؛ D06 جزئیات مدل مالی؛ D07 نوع/تعداد desk؛ D08 Google Calendar؛ D09 مناسبت‌های باستانی؛ D10 تم‌های تازه؛ D11 موبایل؛ D12/D13 فروشگاه/پرداخت؛ D14/D15 AI؛ D16 share ACL؛ D17 supergroup؛ D18/D19 SEO/Analytics؛ D20 محتوا؛ D21 Profile/Search؛ D22 conflict resolution.
- استفاده از Gemini/جایگزین، ربات سیو، natural-language event/task: نام مطرح شده ولی قرارداد، provider، privacy، scope و معیار پذیرش در docs نهایی نیست.
- زمان استراحت/Snooze/DND هوشمند Habit خارج از معیار خطا در این مأموریت و نیازمند طراحی مستقل است.

### ۴) سالم/قابل بازاستفاده؛ بازنویسی نکنید

- تقویم/تبدیل شمسی، قمری رسمی و میلادی و dataset مناسبت؛ app shell، localization strings، themes و settings foundation.
- recordهای مشترک task/habit/event برای دو desk و visibility مجزای event.
- habit log، counter/timer و goal/streak/calendar روی همان داده.
- Group/connections و period privacy foundation؛ Apps feature module controls.
- PHP و Django APIهای موجود و migrationهای افزایشی، ownership checks؛ ledger foundation.
- backup/ICS preview/dedup، date tools، onboarding/tutorial/template و PWA shell.
- Android WebView/bridge، OTA file list، reminder/widget/share plumbing؛ APK واقعی/پشتیبانی installer همچنان جداگانه verify شود.

## اولویت فنی پیشنهادی

| اولویت | بخش | کمبود/ریسک | وابستگی | اقدام | معیار پذیرش |
|---|---|---|---|---|---|
| P0 | Sync/حفظ داده | conflict/version/tombstone و احتمال برگشت حذف طبق audit پیشین | تصمیم D22، PHP/Django contract | طراحی تست‌های دو دستگاه و tombstone durable؛ audit-only در این مأموریت | update/update، delete/update، offline/reconnect و retry không duplicate؛ هیچ edit گم نشود. |
| P0 | Auth/MCP/دسترسی | OAuth destination/state review؛ MCP broad key; cross-owner proof در production نیست | محیط staging و consent/scopes decisions | security review و تست integration جداگانه | state/code یک‌بارمصرف، strict redirect allowlist، key revoke/redact، owner isolation؛ هیچ data cross-user. |
| P1 | API parity/migration | اختلاف PHP `/sync` و Django record APIs؛ PHP در این نشست قابل lint نیست | PHP runtime isolated | قرارداد مشترک و migration dry-run/backups | PHP/Django fixtures رفت‌وبرگشت دادهٔ قدیمی بدون loss؛ migration شکست را آشکار می‌کند. |
| P1 | Notification | تحویل واقعی/صف و native مجوزها نامعلوم | device + push credentials/cron | تست repeatable end-to-end در مرورگر و Android واقعی | restart/offline/DST/permission revoked، no duplicate and no stale reminders. |
| P1 | Recurrence/Calendar | custom recurrence complete parity و exception edge cases | D02/D08/D09 | contract-focused regression به تفکیک adapter | last-day/month, leap year, calendar basis, exceptions؛ PHP/Django output برابر. |
| P1 | Finance & University | foundation جدید است؛ no production API | API deploy/testing environment | phase 2 integration gates | account scoped, refresh/reopen, encrypted queue, idempotency, direct task/event links, data ownership. |
| P2 | Projects, debt/savings/report, class schedule | بخش‌های مصوب/تصمیمی باقیمانده | D04–D07 | مشخص‌کردن acceptance قبل از coding | کاربر بتونه کامل create/edit/delete/report و archive؛ با data existing رکورد اضافی ساخته نشود. |
| P2 | Theme/UX/accessibility | فقط تست Unit؛ matrix UI کامل جدید نیازمند اجرای دوباره | browsers/devices | smoke per locale/appearance/viewport | fa/en × 360/1280 × light/dark؛ keyboard/focus, labels, no overflow. |
| P3 | Store/AI/SEO/extra profile | تصمیم‌ها یا capability جدید | D12–D21 و credentials | تصمیم محصول و privacy review پیش از scope | server-authoritative access/consent/rollback؛ no secret or third-party runtime leak. |

## نقشهٔ راه پیشنهادی

1. **اعتماد به داده:** reopen issueهای R01/R02؛ ساختن test matrix دو دستگاه و تصمیم D22. هیچ migration/payment/desk جدید تا قبول sync invariants.
2. **قرارداد بک‌اند:** تست parity PHP↔Django برای planning/auth/notifications/finance/university؛ migration review/backup/restore؛ PHP run در runtime matching production.
3. **امنیت و حساب:** review OAuth/MCP/session/recovery/delete، data ownership و logs، قبل از share یا public account flow.
4. **تکمیل core:** notification/device matrix و recurrence/calendar acceptance؛ بعد UI business flows و accessibility در دو زبان/tem.
5. **deskهای تخصصی:** تکمیل Finance/University مطابق تصمیم‌های موجود؛ تصمیم و scope جدا برای projects, debts/savings, gym, store, AI, SEO.
6. **release gate:** آزمون bundle استاتیک و API جدا، credentials non-prod، privacy review، Android signing/device، production deploy فقط پس از review و فرمان release جداگانه.

## دمو آنلاین و تصمیم انتشار

- **لینک مخزن:** [danielmodir/avand-website](https://github.com/danielmodir/avand-website)
- **لینک Pages:** [https://danielmodir.github.io/avand-website/](https://danielmodir.github.io/avand-website/)
- **لینک دمو:** [https://danielmodir.github.io/avand-website/demo/](https://danielmodir.github.io/avand-website/demo/)
- **لینک دمو دامنهٔ اصلی:** [https://toojibee.ir/demo/](https://toojibee.ir/demo/)
- **HTTP:** URLهای بالا در ۲۶ نوامبر ۲۰۲۶ پاسخ 200 دادند؛ صفحهٔ demo بارگذاری شد، viewport عمومی در 360 و 1280 overflow نداشت، درخواست resource خارجی در مشاهدهٔ performance صفر بود.
- **نسخه/Commit که روی Pages دیده شد:** asset `2026-11-22.6`؛ طبق سابقهٔ repo آخرین انتشار ثبت‌شده commit `ff1de50fdbff4c73cd0dd186ac739a06d92e7ffc`. commit جاری `6939d1e5f345a7f2c3f5821c820b865e173268b4` هنوز online نیست.
- **انتشار commit جاری:** انجام نشد. Pages workflow فعلی فقط `master` را خودکار deploy می‌کند؛ `master` روی commit قدیمی‌تر است. workflow manual ممکن است branch انتخابی را بپذیرد، اما GitHub CLI در این محیط credential ندارد و ابزار اتصال موجود امکان workflow dispatch ندارد. من master/production را تغییر ندادم و لینک را به‌عنوان نسخهٔ جاری معرفی نمی‌کنم.
- **محدودیت دمو Pages:** `apiBase` خالی است؛ ورود واقعی/دادهٔ سروری و بخش‌هایی که API لازم دارند کاربرمحور فعال نیستند. ذخیره‌سازی محلی و تست تک‌دستگاهی است و با پاک‌شدن browser storage می‌تواند از دست برود؛ داده نمونهٔ نمایشیِ backend ساخته نشده. دمو `noindex` است. برای release دقیق commit باید یک maintainer مجاز workflow را روی branch review اجرا کند یا طبق دستور release آن را merge/push کند؛ سپس smoke URL/version و no-external را دوباره بگیرد.
- **وضعیت:** URL موجود **تأییدشده، اما stale**؛ انتشار commit مورد ممیزی **ناموفق/اجرا نشده به‌خاطر نبود GitHub auth و release workflow path**. لینک فرضی ارائه نشده است.

## فایل‌های تغییرکرده در این مأموریت

فقط این سند گزارش و یک ردیف تاریخچه در `docs/CHANGES.md` اضافه می‌شود؛ فایل محصول، API، دیتابیس، تنظیمات deploy یا دمو دست نخورده است. Commit این گزارش روی شاخهٔ review باقی می‌ماند؛ به `master` یا هاست push نمی‌شود.

## گزارش انتقال وضعیت واقعی پروژه توجیبی به ChatGPT

```text
Toojibee repo snapshot 2026-11-26, HEAD 6939d1e5 on codex/phase2-development-2026-11-22.
Published Pages is stale: /avand-website/demo/ returns app asset 2026-11-22.6 (recorded publish commit ff1de50); current review branch is not deployed. GitHub CLI has no authenticated session here. Do not claim current commit is online.

Architecture: static vanilla HTML/CSS/JS frontend in frontend/, app prototype frontend/demo/, PHP/PDO API at backend-php for toojibee.ir, separate Django 5.2/DRF API in backend/ not deployed, Android Kotlin WebView+native bridge, MySQL bootstrap for Django. PHP uses versioned JSON /sync for planning; Django has per-record APIs/models. These are not interchangeable. Pages apiBase is empty/offline: no real account or backend data. Do not connect the demo to the production PHP API or expose real user data.

Verified in this session: Node 69/69; Django 115/115; Android :app:checkBankSmsParser passed with JDK20; local app loaded, no external runtime resources observed, no overflow at 360/1280. Public Pages and toojibee.ir demo return HTTP 200 but old asset version. PHP CLI unavailable; no PHP rerun, real OAuth/API account, production DB, two-device sync, live notifications, actual Android device/APK release, or full locale/theme UI matrix. Prior docs/CHANGES report PHP SQLite smoke, migration check, and finance/university matrix for 2026-11-26; treat these as recorded prior evidence, not independently repeated here.

Implemented foundations to preserve: Jalali/Gregorian/official Hijri dates and local occasion dataset; planning tasks/events; separate Habit Tracker reusing same records/logs; custom reminders/Android scheduling; calendar weekend settings; groups/friends/period; six palettes/two appearances; backup/ICS/date tools/PWA/share cards; private financial accounts/ledger/categories/budgets/encrypted offline vault and SMS drafts requiring opt-in+confirmation; university dossiers/terms/course attempts/GPA/transfers/resource links with links to shared tasks/events; Android WebView/OTA/widgets/bridge. Keep existing contracts/data and add incrementally.

Partial/incomplete: two-device conflict/tombstone behavior (prior audit R01/R02); PHP/Django contract parity; full Google Calendar sync absent (ICS is not sync); recurrence model/UI parity; push/native notification delivery and real device permissions; event map search/attachments/category rules; debt/credit/savings/recurring dues/full reports; university class schedule/attachments and full planning visibility; advanced social ACL/supergroup assignment/workflows; sessions/security flows and Google production callback; undo with five-second window; 30-day Trash; project/list/Kanban model. Store UI is disabled placeholder; no payment/entitlement. MCP is an external personal integration, not an in-app chatbot, and never handles period data. No Gemini/natural-language creation/SEO bot/Search Console adapter/Save Bot found.

Needs product decisions already documented at docs/next-version/DECISIONS.md: D03, D04-D22. Core open decisions include undo scope, university/gym scope, financial details, calendar sync, old-month recurrence, share ACL, supergroups, pricing/payment, AI access/provider, SEO integrations, profile/search, and conflict resolution. Do not infer features from names or invent scope. Habit smart rest/snooze/DND and attendance/term details explicitly outside current request; don't label missing as bug.

Priority: P0 resolve sync conflict/deletion and security review of OAuth/MCP/ownership; P1 prove PHP-Django contracts, migrations/restore, notifications, recurrence, finance/university offline queues and API parity; P2 implement only approved remaining Finance/University/Projects/ACL behavior; P3 store/AI/SEO after product/privacy decisions. Do not rewrite healthy records or create parallel tables/flows.

Demo status: GitHub Pages is a static offline demo and safe from production account DB as long as apiBase stays empty. For a current release, an authorized maintainer must dispatch Pages from the review branch (workflow_dispatch) or explicitly approve merge/push. Verify public version query, assets, both languages/themes at 360/1280, no external runtime requests, and only then record deployed SHA. Current public link is real but stale.
```
