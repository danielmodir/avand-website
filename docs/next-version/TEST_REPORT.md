# گزارش تست و حدود اطمینان

## ۲۰۲۶-۱۱-۲۵ — آماده‌سازی اتصال Pages به PHP

- API زندهٔ `https://toojibee.ir/api/v1/health` پاسخ 200 داد. پاسخ `/auth/providers` با Origin مربوط به Pages هدر `Access-Control-Allow-Origin` نداشت؛ preflight ورود با OPTIONS پاسخ 405 داد. بنابراین اتصال مستقیم Pages در وضعیت فعلی مرورگر کار نمی‌کند.
- پچ CORS فقط مبدأ `https://danielmodir.github.io` را می‌پذیرد و cookie/credential بین‌دامنه‌ای فعال نمی‌کند. PHP CLI محلی و کنترل پنل مرورگر در این نشست در دسترس ابزار نبود؛ syntax و رفتار پچ روی هاست هنوز آزموده نشده‌اند و انتشار API انجام نشده است.
- آزمون Node در شاخهٔ اصلی کار 64/64 موفق بود؛ مجموعهٔ Django در درخت کاری هم‌زمان 105 آزمون اجرا کرد و دو خطای مالیِ تغییرات ثبت‌نشدهٔ هم‌زمان داشت. این خطاها به پچ CORS مربوط نیستند.

## ۲۰۲۶-۱۱-۲۳ — بازبینی یکپارچه پیش از انتشار تست

- `node --test tests/*.test.js`: 64/64 PASS.
- `manage.py test apps --settings=config.settings.test --noinput`: 103/103 PASS.
- Chromium محلی: 12 ترکیب `/fa/`، `/en/` و `/demo/` در 360/1280 و روشن/تاریک؛ 48 ترکیب تم برنامه. خطای صفحه، درخواست خارجی، تصویر بارگذاری‌شدهٔ خراب یا سرریز افقی صفر.
- `deploy/build-site-zip.ps1`: خروج 0، بستهٔ 255 فایلی. اجرای PHP، OAuth واقعی و دستگاه اندروید در این مرحله ممکن نبود.
- GitHub Pages اجرای 45069902360: موفق. پاسخ HTTP برای `/`، `/fa/`،
  `/en/`، `/demo/` و CSS جدید 200 بود؛ 12 حالت مرورگر روی URL عمومی نیز
  بدون خطا، درخواست خارجی، تصویر خراب یا سرریز گذشت.

## ۲۰۲۶-۱۱-۲۲ — نشانی و لینک جلسهٔ ایونت

- `node --test tests/*.test.js`: 53/53 PASS؛ آزمون تازه، نگهداری هر دو فیلد روی همان ایونت و رد لینک ناامن را پوشش داد.
- `manage.py test apps --settings=config.settings.test --noinput`: 96/96 PASS؛ تست API جدید، ساخت/ویرایش/sync و رد `javascript:` را پوشش داد. `makemigrations planning --check --dry-run`: بدون تغییر مدلِ جاافتاده.
- Chromium: 8/8 ترکیب 360/1280 × fa/en × light/dark؛ فرم دارای دو فیلد، ذخیره با کلیک واقعی، نمایش در جزئیات، بدون سرریز/pageerror/درخواست خارجی.
- PHP CLI، API روی میزبان، دستگاه Android، جست‌وجوی مکان، مختصات و باز کردن برنامهٔ نقشه بررسی نشده‌اند.

## ۲۰۲۶-۱۱-۲۲ — اتصال OAuth در PHP

- `node --test tests/php-google-client.test.js`: 1/1 PASS؛ کلاینت PHP جریان مشترک verifier و پاسخ واقعی `/auth/providers` را مصرف می‌کند.
- `node --test tests/*.test.js`: 53/53 PASS در درخت کاری فعلی.
- PHP CLI در PATH نیست؛ syntax/migration و جریان واقعی OAuth در PHP اجرا نشده است. Credential و callback محیط آنلاین نیز آزموده نشده‌اند.

## ۲۰۲۶-۱۱-۱۸ — یادآوری مناسبت

- آزمون جدید Node برای کلید قاعده، نوبت‌های اعلان، خاموش/حذف و نگاشت تنظیمات Django؛ آزمون جدید Django برای اعتبارسنجی ساختار و جلوگیری از ساعت/فاصله/شناسهٔ نامعتبر. آزمون‌ها پیش از پیاده‌سازی شکست خوردند.
- مجموعهٔ کامل Node 51/51 و Django 94/94، بررسی syntax و مرورگر Chromium موفق؛ آزمون API Django ذخیره، خواندن دوباره و پاک‌کردن تنظیمات را نیز پوشش داد. در مرورگر، ساخت با انتخاب واقعی ساعت، نوبت ۷ روز قبل، خاموش‌کردن و حذف انجام شد. هشت ترکیب 360/1280 × fa/en × روشن/تاریک بدون سرریز، pageerror یا درخواست خارجی بودند.
- PHP CLI، سرور Push واقعی، Android WebView و تغییر تاریخ رسمی وقتی برنامه بسته است آزموده نشده‌اند؛ الگوی یادآوری دسته/کشور هنوز ساخته نشده و این بخش In Progress است.

## ۲۰۲۶-۱۱-۱۸ — کلاینت ورود گوگل

- `node --test tests/google-oauth-client.test.js`: 2/2 PASS؛ هر دو ابتدا با کلاینت قبلی شکست خوردند، سپس challenge و verifier یک‌بارمصرف را تأیید کردند.
- `node --test tests/*.test.js`: 48/48 PASS؛ بررسی syntax فایل‌های `api.js` و `events.js` نیز موفق.
- درخواست واقعی به Google و API روی سرور منتشرشده، مرورگر Android و حالت خطای ذخیره‌سازی آزمون نشده‌اند. تست Django سرور در بستهٔ ایونت 91/91 روی درخت کاری جاری موفق بود.

## ۲۰۲۶-۱۱-۱۷ — نمایش مستقل ایونت

- `node --test tests/event-visibility.test.js`: 3/3 PASS؛ مقدار پیش‌فرض دادهٔ قدیمی، جدایی دو گزینه، ذخیرهٔ فرم و نمایش دو میزکار. آزمون‌ها ابتدا برای نبود تابع/فیلد شکست خوردند.
- `node --test tests/*.test.js`: 46/46 PASS. فایل مرورگری `theme-ui.cjs` به بستهٔ `playwright` محلی وابسته است و در این فرمان نیست؛ اجرای جداگانهٔ آن به‌علت نصب نبودن بسته متوقف شد.
- `manage.py test apps --settings=config.settings.test --noinput`: 91/91 PASS روی SQLite آزمایشیِ درخت کاری فعلی؛ یک تست جدید رفت‌وبرگشت فیلدهای Event و اصلاح محلی تست Google در شمارش است. اصلاح Google جزو commit این بسته نیست.
- Chromium محلی: 8/8 ترکیب 360/1280 × fa/en × light/dark؛ هر میزکار فقط رویداد مجاز خود را نشان داد، جهت فارسی و حالت تم درست بود، فرم با کلیک واقعی گزینه را ذخیره کرد؛ pageerror، سرریز افقی و درخواست خارج از origin صفر.
- `makemigrations --check --dry-run` عمومی هنوز drift مستقل `core.EmailOutbox.template` نشان می‌دهد. planning 0010 در تست SQLite اعمال شد؛ MySQL/هاست واقعی، PHP CLI و Android WebView آزموده نشده‌اند. ورود Google در کلاینت وب Django هنوز با challenge/verifier جدید سرور هماهنگ نیست.

## ۲۰۲۶-۱۱-۱۷ — اعتبارسنجی ساعت انتخابگر

- `node --test tests/*.test.js`: 43/43 PASS؛ سه تست جدید برای ساعت شروع، ترتیب همان‌روز و عبور از نیمه‌شب.
- `backend/.venv/Scripts/python.exe manage.py test apps --settings=config.settings.test`: 89/90 PASS؛ تست موجود GoogleRedirectFlowTests.test_start_callback_exchange با HTTP 400 به‌جای 302 شکست خورد. مسیر Django OAuth اکنون challenge می‌خواهد ولی تست و کلاینت Django آن را نمی‌فرستند؛ این بخش هنوز آمادهٔ انتشار نیست.
- `git diff --check`: بدون خطای محتوایی؛ هشدارهای تبدیل LF/CRLF در فایل‌های موجود.
- بررسی مرورگر، دستگاه واقعی، PHP و استقرار آنلاین برای این تغییر انجام نشده‌اند.

## ۲۰۲۶-۱۱-۱۶ — یادآوری در بازه

- تأیید نهایی asset 2026-11-16.8: کل تست‌های Node در working tree، 40/40 PASS؛ build-site-zip exit 0 با 71 fallback و ZIP 254 فایل؛ همان 8 سناریوی ایجاد/ویرایش/حذف یادآوری روی بستهٔ تجمیعی نیز PASS، pageerror/external صفر. بسته شامل تغییرات مستقل working tree است و منتشر نشده.
- `node --test tests/reminder-window.test.js`: 9/9 PASS؛ مثال‌ها، بازه نامعتبر/صفر/منفی/اعشاری، نیمه‌شب، DST gap، cutoff، تغییر/حذف و نگاشت API؛ تست روی snapshot دقیق index نیز 9/9 PASS، مستقل از تغییرات ثبت‌نشدهٔ دیگر.
- `manage.py test apps.planning apps.core.test_weekends --settings=config.settings.test --noinput`: 24/24 PASS؛ شامل 4 تست API جدید با سه نوع فعالیت، validation، legacy، overnight و حذف یادآوری بدون تکثیر فعالیت.
- `makemigrations planning --check --dry-run --settings=config.settings.test --noinput`: PASS. بررسی عمومی Migrationها یک drift مستقل در core EmailOutbox.template یافت؛ در این کار تغییر داده نشد.
- Chromium منبع: 8/8 در 360/1280 × fa/en × light/dark؛ ایجاد، انتهای شامل، رد صفر، ویرایش همان فعالیت و حذف یادآوری؛ pageerror/external صفر. ورودی‌ها برای لمس 44px اصلاح شدند.
- PHP CLI روی PATH موجود نیست؛ تست backend-php/tests/reminder-windows.php نوشته شد ولی اجرا نشده. تحویل واقعی اعلان، ظرفیت صف پرتراکم، WebView گوشی و timezone هنگام بسته بودن برنامه تأیید نشده‌اند؛ In Progress.

## ۲۰۲۶-۱۱-۱۶ — بازبینی و تست بستهٔ واقعی

- بازبینی مستقل یک P2 پیدا کرد: @import توکن‌ها بعد از تجمیع CSS نادیده گرفته می‌شد. با لینک صریح و استخراج متغیرهای layout از منبع مرکزی اصلاح شد.
- اجرای بستهٔ working tree یک ایراد دیگر را بازتولید کرد: bundle شامل کد بدنه در head اجرا می‌شد و listener روی null می‌افتاد. builder اکنون اسکریپت‌های head را جدا و در فهرست فایل‌های Android حفظ می‌کند.
- `powershell -NoProfile -ExecutionPolicy Bypass -File deploy/build-site-zip.ps1`: exit 0، 71 fallback CSS، ZIP محلی 254 فایل (شامل تغییرات ثبت‌نشدهٔ مستقل؛ بسته برای انتشار تحویل نشده است).
- Chromium روی بستهٔ تجمیعی محلی: 8/8، شروع واقعی برنامه، padding 8px و radius 14px، بدون overflow/pageerror/external request.
- مجموعهٔ Node: 31/31 PASS؛ `manage.py test apps.planning apps.core.test_weekends --settings=config.settings.test --noinput`: 20/20 PASS. گوشی واقعی/APK/هاست تست نشده‌اند.

## ۲۰۲۶-۱۱-۱۶ — انتخاب آخر هفته

- `node --test tests/weekends.test.js`: 2/2 PASS؛ چند روز، پاک‌کردن انتخاب، استقلال از شروع هفته، برچسب غیررنگی. تست‌ها ابتدا برای نبود helper شکست خوردند.
- `backend/.venv/Scripts/python.exe backend/manage.py test apps.core.test_weekends --settings=config.settings.test --noinput`: 2/2 PASS؛ PATCH/GET، ادغام مستقل روزها و رد مقدار غیربولی.
- مرورگر Chromium: انتخاب پنج‌شنبه/جمعه با checkbox واقعی، reload و حفظ انتخاب؛ 8/8 در 360/1280، fa/en، light/dark؛ علامت تقویم و picker، underline و aria، شروع هفته بدون تغییر؛ pageerror/external صفر. بررسی تصویری موبایل فارسی روشن.
- کل مجموعهٔ Node موجود در working tree: 31/31 PASS (شامل تست‌های تم متعلق به کار مستقل). PHP روی هاست و ویجت native گوشی تست نشده‌اند.

## ۲۰۲۶-۱۱-۱۶ — ثبت ایونت در گذشته

- `node --test tests/past-events.test.js`: 5/5 PASS؛ ایجاد/ویرایش، حفظ تاریخ و تکرار، حد picker، حفظ منع تسک و عدم زمان‌بندی اعلان تاریخی. تست ایجاد ابتدا با pastDateNotAllowed شکست خورد.
- `backend/.venv/Scripts/python.exe backend/manage.py test apps.planning.test_past_events --settings=config.settings.test --noinput`: 2/2 PASS؛ ایجاد، ویرایش و sync API و anchor تاریخی تکرار؛ فقط دیتابیس تست.
- Chromium: 360/1280 × fa/en × light/dark؛ 8/8 PASS؛ بازشدن picker با تاریخ گذشته، ثبت با دکمهٔ واقعی UI، نمایش در روز تاریخی، عدم اعلان جاری/آینده؛ pageerror و external request صفر.
- PHP sync سند JSON را بدون منع تاریخ نگه می‌دارد (بررسی کد)؛ PHP روی هاست، گوشی واقعی و اعلان تحویلی OS در این بررسی تست نشده‌اند.

## ۲۰۲۶-۱۱-۱۶ — خط زمانی میزکار

- `node --test tests/planning-timeline.test.js`: 5/5 PASS؛ ترتیب مشترک، tie، دادهٔ قدیمی، reminder-only، حفظ reference و ورودی، 10,000 آیتم، ترتیب پین/انجام موارد بدون ساعت. تست‌ها ابتدا برای نبود تابع شکست خوردند.
- Chromium محلی: 360 و 1280، fa/en، light/dark؛ 8/8 PASS، بدون overflow افقی. بررسی تصویری فارسی روشن موبایل و انگلیسی تاریک دسکتاپ.
- تیک از UI، وضعیت مشترک day sheet، بازشدن جزئیات ایونت و حذف از renderer: PASS. درخواست خارج از origin محلی و pageerror: صفر.
- صرفاً frontend و مدل آفلاین آزمایشی؛ سرور واقعی، WebView روی گوشی، native widget، سرویس خارجی و دادهٔ واقعی تست نشده‌اند.

تاریخ: ۲۰۲۶-۱۱-۱۵. مبنا: `927f48a`. در این مرحله فایل‌های محصول تغییر نکردند؛ تست‌ها وضعیت baseline را بررسی می‌کنند، نه تکمیل نیازمندی‌های نسخهٔ بعد. هیچ تستی به هاست یا دیتابیس واقعی متصل نشده است.

## بررسی‌های اجراشده

| ID | بررسی / فرمان | نتیجه | دامنهٔ اثبات |
|---|---|---|---|
| BASE-01 | `node --test tests/backup.test.js tests/date-tools.test.js tests/prayer-times.test.js` از ریشه | PASS؛ ۱۴ تست، ۰ شکست، خروج 0 | backup JSON/ICS و dedupe؛ تبدیل تاریخ و فاصله؛ زمان نماز شهرها/ترتیب/منطقهٔ زمانی. پوشش عمومی frontend نیست. |
| BASE-02 | `.\.venv\Scripts\python.exe manage.py test apps --settings=config.settings.test --noinput` از `backend/` | PASS؛ ۷۶ تست، ۰ شکست، خروج 0؛ test runner حدود ۱۰٫۸ ثانیه؛ system check بدون ایراد | تست‌های موجود auth/settings، planning/MCP، social/groups، period، calendar، notifications؛ دیتابیس آزمایشی SQLite برای شش alias. |
| BASE-03 | `.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --settings=config.settings.test` از `backend/` | PASS؛ No changes detected؛ خروج 0 | مدل‌ها با Migrationهای فایل تطبیق دارند؛ schema تولید و MySQL آزموده نشده‌اند. |
| BASE-04 | استخراج resolver، model metadata و migration graph بدون connection و query | PASS؛ ۴۷ مدل concrete اختصاصی، مسیرها/جدول‌ها در TECHNICAL_INVENTORY | فهرست کد فعلی؛ نه دسترسی/عملکرد تمام endpointها. |
| PROBE-01 | استخراج تابع واقعی `mergeFromServer` از api-php.js و اجرا در Node VM با state مصنوعی | ریسک R01 بازتولید شد: ID یکسان با title قدیمی محلی، title جدید سرور را نپذیرفت | رفتار همان تابع، بدون server یا دادهٔ کاربر. نشانهٔ نیاز به اصلاح sync، نه موفقیت ویژگی جدید. |
| PROBE-02 | همان تابع، state خالی و `deleted={}` برای شبیه‌سازی نبود tombstone بعد restart | ریسک R02 بازتولید شد: آیتم سرور دوباره به state اضافه شد | probe محدود منطق merge؛ restart واقعی و چند دستگاه به E2E نیاز دارد. |
| DOC-01 | بررسی ساختاری فایل‌های Markdown، لینک‌های داخلی، یکتایی و ارجاع IDها و وضعیت‌ها؛ بازبینی جدول ۱۵ بخش | PASS؛ ۸ سند، ۱۱۱ ID یکتا، ۲۲ تصمیم باز؛ بدون لینک داخلی یا ارجاع ID نامعتبر و بدون Approved؛ جدول ۱۵ بخش بازبینی شد | صحت خود مستندات، نه اجرای UI محصول. |

اجرای اولیهٔ Node در sandbox با `spawn EPERM` قبل از اجرای تست‌ها متوقف شد؛ همان فرمان با مجوز محیط دوباره اجرا شد و هر ۱۴ تست گذشت. این خطای محیط به‌عنوان خرابی محصول ثبت نشده است.

در خروجی Django، HTTPهای 400/401/403/404/409 و traceback مربوط به `InvalidTag` دیده می‌شود. مورد InvalidTag در `apps/period/tests.py` عمداً با جابه‌جایی ciphertext و `assertRaises` آزموده می‌شود؛ نتیجهٔ نهایی suite، OK است. همین نتیجه ثابت نمی‌کند نمایش خطای خرابی داده در UI تولید مطلوب است.

## اجرا نشده / تأیید نشده

| بررسی | وضعیت واقعی و علت | شرط تکمیل |
|---|---|---|
| PHP unit/integration، migration SQLite/MySQL | PHP executable روی PATH پیدا نشد؛ suite اختصاصی PHP در فایل‌های بررسی‌شده نیست | آماده‌سازی runtime محلی isolated و harness؛ بدون استفاده از DB تولید |
| MySQL واقعی و ارتقای دادهٔ قبلی | تست فعلی Django از SQLite استفاده می‌کند | fixture بی‌نام، migration/backfill، constraint/transaction و restore روی MySQL آزمایشی |
| UI در ۳۶۰/۱۲۸۰، fa/en و روشن/تاریک | در این مرحلهٔ صرفاً مستندات browser walkthrough اجرا نشده | برای هر تغییر UI هشت ترکیب؛ screenshot/تعامل/scroll/keyboard و خطای شبکه |
| صفر درخواست خارجی runtime | قواعد و مسیرهای کد بررسی شد؛ network capture عملی انجام نشد | برای صفحات عمومی capture صفر external؛ app Push/OAuth با توضیح مسیر و مجوز جدا |
| کارایی و حجم واقعی خروجی | build/minify/Lighthouse/Core Web Vitals اجرا نشده | بودجهٔ صفحه کمتر از ۳۰۰ KB بدون فونت، خروجی static و PHP جدا، دستگاه/شبکه ثبت‌شده |
| Android build و گوشی واقعی | APK/SDK build یا دستگاه استفاده نشد | سازگاری APK قدیمی، OTA، permission/reboot/Doze/force-stop و قطع شبکه |
| اعلان بسته/بیش از هفت روز | scheduler فعلی فقط از نظر کد بررسی شد | تحویل واقعی و renewal در روز هشتم، لغو/تغییر/عدم تکرار؛ permission و channel |
| Google sign-in/Calendar | OAuth واقعی، حساب آزمایشی یا grant استفاده نشد | credential امن و محیط مجاز؛ callback، revoke، 410/full resync و offline conflict |
| payment/subscription/Premium | سیستم پرداخت فعلی موجود نیست | درگاه آزمایشی، verify سروری، webhook تکراری/جعل/خارج‌ترتیب و انقضا |
| AI chat/model providers | چت‌بات و provider integration موجود نیست | provider واقعی، سقف هزینه، scope، prompt injection/tool permission و privacy |
| GSC/GA و ایندکس/ترافیک | حساب خارجی/دادهٔ عملکرد خوانده نشد | دسترسی مالک property، quota/error و بازهٔ گزارش؛ script جدید analytics مجاز نشده |
| penetration test و امنیت تولید | انجام نشده؛ بررسی کد و ریسک است | آزمون جدا و مجاز روی محیط آزمایشی با دامنهٔ مشخص |
| انتشار/هاست اصلی | عمداً انجام نشده، طبق دستور مالک | دستور صریح انتشار پس از review؛ مجوز بررسی به معنی مجوز deploy نیست |

## ماتریس آزمون نسخهٔ بعد

| حوزه | سناریوهای پذیرش لازم | IDهای مرتبط |
|---|---|---|
| sync | create/update/delete دو دستگاه، تعارض هم‌زمان، restart آفلاین، retry، storage full، session expired، عدم گم‌شدن/زنده‌شدن داده | NV-00-02، NV-06-04 |
| recurrence/date | leap، آخر ماه در سه تقویم، start/end شامل مرزها، تاریخ مشخص/استثنا، تغییر یک نوبت/بعدی‌ها/همه، timezone، past event بدون flood اعلان | NV-01-05 تا 10، NV-03-05 |
| روزانه/UI | اولویت زمان و پین/اتمام، آیتم بدون ساعت، Drag معکوس، ورود دستی نامعتبر، دو زبان/mode، صفحه‌کلید و لمس | NV-01، NV-05 |
| اعلان | foreground/background، permission denied/revoked، دقیق/غیردقیق، reboot، force-stop و پیام محدودیت، بیش از ۷ روز، صوت/channel، DND، Undo/cancel، پایان timer و overdue جدا | NV-01-13 تا 15، NV-03-04، NV-04، NV-06-05 |
| مجوز/اجتماعی | کاربر غیرمالک، viewer/editor/admin، خروج/اخراج عضو، revoke لینک/اشتراک، assignee معتبر، دسترسی به داده پس از تغییر نقش | NV-00-03، NV-10، NV-12 |
| مالی/پرداخت | precision مبلغ و واحد، مجموع گزارش=تراکنش‌ها، تاریخ بودجه، ownership، جعل entitlement، verify مجدد و webhook تکراری، پایان اشتراک و آفلاین | NV-02-03 تا 09، NV-07 |
| چرخه/AI | ciphertext، localOnly، export/erase/logout، منع period در toolها، scope خواندن/نوشتن، revoke، injection و تأیید تغییر حساس | NV-02-11، NV-08 |
| Google | CSRF/state binding/replay، callback محدود، حساب تکراری، بازگشت از مرورگر سیستم، token refresh/revoke، Calendar sync 410/conflict/delete | NV-06-01/02، NV-03-01 |
| SEO/مقالات | title/meta/heading/alt/link، canonical/hreflang/redirect، static/PHP sitemap، /demo/ noindex، crawl allowlist، proposal قبل write، slug قدیمی، writer/reviewer | NV-09، NV-11 |
| میزکار/تم | registry و fallback، فعال/غیرفعال بدون حذف داده، ارتقای تنظیم قدیمی، هر دو تم جدید و modeها، Android bars/کارت اشتراک | NV-02، NV-05-02 تا 04، NV-12-05 |

## قالب ثبت نتیجهٔ هر قابلیت

برای هر ID پس از شروع: commit/محیط/fixture؛ FE؛ BE-PHP؛ BE-Django؛ DB/Migration؛ API Integration؛ Validation؛ Error Handling؛ تست واحد/قرارداد/یکپارچه/دستی؛ نتیجهٔ واقعی و شواهد؛ محدودیت حل‌نشده؛ وضعیت بعدی. N/A باید دلیل داشته باشد. تأیید نهایی مالک با تاریخ ثبت شود؛ اکنون هیچ Approved وجود ندارد.
