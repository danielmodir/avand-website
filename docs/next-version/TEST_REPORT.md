# گزارش تست و حدود اطمینان

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
