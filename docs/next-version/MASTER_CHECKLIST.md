# چک‌لیست مرکزی نسخهٔ بعد Toojibee

تاریخ: ۲۰۲۶-۱۱-۱۵. مبنای کد `927f48a`. تعداد ردیف‌ها: **111**؛ اولویت‌ها پیشنهاد ترتیب فنی‌اند، نه حذف قابلیت‌ها.

## روش خواندن و تغییر وضعیت

- Status وضعیت **کار نسخهٔ جدید** است؛ Frontend/Backend/Database وضعیت پایهٔ مشاهده‌شده در کد است و هنگام توسعه باید به وضعیت واقعی اجرا به‌روز شود.
- E = کد/ساختار موجود؛ P = بخشی موجود یا ناقص؛ N = در محدودهٔ بررسی پیدا نشد؛ — = تغییر مستقیم این لایه انتظار نمی‌رود و هنگام اجرا بازبینی می‌شود. E به‌معنای Implemented یا تأیید محصول نیست.
- PHP = بک‌اند هدف هاست فعلی؛ DJ = Django منتشرنشده. جزئیات شواهد در [گزارش](AUDIT.md)، [فهرست فنی](TECHNICAL_INVENTORY.md) و کدهای مقصد در [برنامه](IMPLEMENTATION_PLAN.md).
- P0 = حفاظت داده/دسترسی یا دروازهٔ لازم پیش از انتشار بخش وابسته؛ P1 = زیرساخت مشترک و رفتار اصلی؛ P2 = قابلیت‌های وابستهٔ همین نسخه. همه در دامنه باقی می‌مانند.
- تمام ردیف‌های توسعه فعلاً `[ ] Not Started` هستند؛ بررسی و مستندسازی در انتظار بررسی مالک است. **هیچ Approved ثبت نشده است.**
- وضعیت‌های مجاز: `[ ] Not Started` → `[ ] In Progress` → `[ ] Implemented` → `[ ] Testing` → `[ ] Awaiting User Review` → `[x] Approved`.
- Implemented فقط پس از بررسی عملکرد واقعی FE، BE، DB، API Integration، Validation، Error Handling و تست‌های ضروری؛ Testing برای تکمیل regression و ارزیابی گسترده است. UI به‌تنهایی کافی نیست.
- Testing فعلی «Pending» برای معیارهای نسخهٔ بعد است؛ نتایج ۱۴ تست JS و ۷۶ تست Django موجود در [گزارش تست](TEST_REPORT.md) ثبت شده‌اند و به همهٔ ردیف‌ها تعمیم داده نمی‌شوند.
- هنگام شروع هر ردیف، Notes باید commit، معیار پذیرش، وابستگی‌ها، نتیجهٔ API/Validation/Error Handling و تصمیم مرتبط را داشته باشد؛ موارد بدون کاربرد با دلیل N/A شوند. Approved به تاریخ و تأیید صریح مالک نیاز دارد.
- شناسهٔ کوتاه در Notes مانند `01-08` همان `NV-01-08` است. Rها در AUDIT و Dها در DECISIONS تعریف شده‌اند.

## 00 — زیرساخت و کنترل کیفیت

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-00-01 | بررسی و مدیریت نسخه | نقشهٔ کد، چک‌لیست، تصمیم‌ها و گزارش تست قابل نگهداری | P0 | [ ] Awaiting User Review | — | — | — | Baseline + سند؛ TEST_REPORT | DOC؛ گزارش آمادهٔ بررسی؛ شروع توسعه با هماهنگی مالک |
| NV-00-02 | همگام‌سازی امن | حفظ ویرایش/حذف هم‌زمان، صف آفلاین پایدار و بازیابی تعارض | P0 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | SYNC؛ R01/R02؛ D22 |
| NV-00-03 | مجوز مشترک | کنترل مالکیت و مجوز workspace/share/AI/Premium در سرور | P0 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | AUTH؛ پیش‌نیاز 07/08/10؛ D14/D16/D17 |
| NV-00-04 | قرارداد و Migration | نسخه‌گذاری داده و API، نگاشت دو کلاینت، مهاجرت افزایشی و بازیابی | P0 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | DATA؛ R03/R06؛ پیش‌نیاز مدل‌های جدید |
| NV-00-05 | تست قرارداد و امنیت | پوشش PHP و دو کلاینت، ownership، validation، خطا و سناریوی آفلاین | P0 | [ ] Not Started | P | PHP:N / DJ:P | P | Pending | QA؛ تست‌های موجود محدودند |
| NV-00-06 | سازگاری و کارایی | حفظ دادهٔ قبلی، fa/en، 360/1280، دو تم، WebView قدیمی و شبکهٔ کند | P0 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | QA؛ معیار پذیرش همهٔ قابلیت‌ها |
| NV-00-07 | دروازهٔ بررسی و انتشار | بررسی شناسه‌به‌شناسه، فقط مالک Approved، انتشار جداگانه و قابل بازگشت | P0 | [ ] Not Started | — | — | — | Pending | DOC؛ دستور C01/C02؛ هیچ deploy در این مرحله |

## 01 — میزکار اصلی

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-01-01 | اولویت تسک زمان‌دار | نمایش تسک‌های دارای زمان پیش از تسک‌های بدون زمان با قاعدهٔ پین/اتمام مشخص | P1 | [ ] Not Started | P | — | — | Pending | PLAN؛ D01؛ مرتب‌سازی فعلی پین/انجام است |
| NV-01-02 | ایونت کنار تسک | نمای مشترک تسک و ایونت در برنامهٔ روز | P1 | [ ] Not Started | P | — | — | Pending | PLAN؛ وابسته 01-01؛ D01 |
| NV-01-03 | تقسیم‌بندی زمانی | نمایش یکپارچهٔ فعالیت‌ها در بخش‌های زمانی توافق‌شده | P1 | [ ] Not Started | N | — | — | Pending | PLAN؛ D01 |
| NV-01-04 | نمای برنامهٔ روزانه | بهبود خوانایی و تعامل روزانه و وضعیت‌های خالی/بارگذاری/خطا | P1 | [ ] Not Started | P | — | — | Pending | PLAN؛ 01-01 تا 03؛ D01 |
| NV-01-05 | ایونت گذشته | ثبت ایونت معمولی در گذشته، بدون اعلان ناخواستهٔ عقب‌افتاده | P1 | [ ] Not Started | P | PHP:P / DJ:E | E | Pending | PLAN؛ فعلاً فقط تولد مجاز؛ پوشش درخواست 03 نیز |
| NV-01-06 | انتخاب بازه با Drag | تکمیل و آزمون انتخاب بازهٔ تاریخ/زمان با Drag و جایگزین قابل دسترس | P1 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | DATE؛ Drag تاریخ موجود؛ D02 |
| NV-01-07 | ورود مستقیم بازه | کادر شروع/پایان با انتخاب و ورود مستقیم تاریخ و اعتبارسنجی | P1 | [ ] Not Started | P | PHP:P / DJ:E | E | Pending | DATE؛ picker موجود، ورود مستقیم کامل نیست؛ D02 |
| NV-01-08 | تکرار فاصله‌ای در بازه | هر N واحد در شروع/پایان معین و حفظ نوبت‌ها | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | RECUR؛ 00-04؛ rangeNoRepeat فعلی؛ D02 |
| NV-01-09 | تکرار روز/تاریخ مشخص | انتخاب روزهای هفته و تاریخ‌های مشخص در بازه | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | RECUR؛ 01-08؛ D02 |
| NV-01-10 | اعلان مطابق تکرار | یک منطق وقوع برای نمایش و اعلان، لغو و حذف بدون اعلان تکراری | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | NOTIFY؛ 01-08/09؛ پوشش 04 هم |
| NV-01-11 | انتخاب آخر هفته | انتخاب یک یا چند روز آخر هفته مستقل از شروع هفته | P1 | [ ] Not Started | N | PHP:P / DJ:N | N | Pending | PREF؛ 00-04؛ weekStartDay موجود است |
| NV-01-12 | رنگ قرمز آخر هفته | نمایش روزهای انتخاب‌شده در همهٔ نماهای تقویم و دو تم با توکن | P1 | [ ] Not Started | P | — | — | Pending | DATE؛ 01-11؛ اکنون تعطیلات dataset رنگ می‌گیرند |
| NV-01-13 | DND هر عادت | سکوت مستقل عادت و اعمال در مرورگر/سرور/Android | P1 | [ ] Not Started | N | PHP:N / DJ:P | N | Pending | NOTIFY؛ 01-10؛ D03؛ mute ماژول Django معادل آن نیست |
| NV-01-14 | Undo پنج ثانیه | برگرداندن عملیات توافق‌شده طی ۵ ثانیه، سازگار با sync و اعلان | P1 | [ ] Not Started | N | PHP:P / DJ:P | P | Pending | MUTATION؛ 00-02؛ D03 |
| NV-01-15 | آلارم پایان تسک | اعلان واقعی پایان زمان اختصاص‌یافته، توقف/اتمام/پس‌زمینه طبق قرارداد | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | NOTIFY؛ D03؛ overdue و تایمر عادت موجود؛ پوشش 04 |

## 02 — میزکارهای تخصصی

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-02-01 | دانشگاهی | میزکار مستقل دانشجویان با قابلیت گسترش و امکانات اولیهٔ مصوب | P2 | [ ] Not Started | P | PHP:N / DJ:N | N | Pending | DESK؛ 02-13،01-08؛ فقط template مطالعه موجود؛ D04 |
| NV-02-02 | باشگاه | میزکار مستقل برنامه و ثبت فعالیت ورزشی | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | DESK؛ 02-13؛ D05 |
| NV-02-03 | ثبت درآمد | ورودی درآمد با مبلغ، تاریخ و دسته در مدل مالی مصوب | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | FIN؛ 00-03/04،02-13؛ D06 |
| NV-02-04 | ثبت هزینه | ثبت و اصلاح هزینه بدون از دست رفتن تاریخچهٔ لازم | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | FIN؛ 02-03؛ D06 |
| NV-02-05 | بودجه | تعریف و پیگیری بودجه در دورهٔ توافق‌شده | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | FIN؛ 02-03/04؛ D06 |
| NV-02-06 | دسته‌بندی مالی | مدیریت دسته‌های درآمد و هزینه و ارجاع امن تراکنش‌ها | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | FIN؛ 02-03؛ D06 |
| NV-02-07 | گزارش مالی | گزارش درآمد/هزینه/بودجه با ارقام تطبیق‌پذیر | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | FIN؛ 02-03 تا 06؛ D06 |
| NV-02-08 | نمودار مالی | نمودارهای تحلیلی قابل دسترس بر اساس دادهٔ واقعی | P2 | [ ] Not Started | N | PHP:N / DJ:N | — | Pending | FIN؛ 02-07؛ D06؛ بدون CDN |
| NV-02-09 | بازهٔ مالی | مقایسه و بررسی وضعیت مالی در بازه‌های مختلف | P2 | [ ] Not Started | N | PHP:N / DJ:N | P | Pending | FIN؛ 02-07؛ D06 |
| NV-02-10 | میزکار عادت‌ها | نمای مستقل/تخصصی عادت‌ها با حفظ تیک، شمارنده و تایمر موجود | P2 | [ ] Not Started | P | PHP:E / DJ:E | E | Pending | DESK/PLAN؛ 02-13؛ D07 |
| NV-02-11 | میزکار چرخه | حفظ و یکپارچه‌سازی میزکار فعلی و حریم خصوصی آن | P1 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | PERIOD؛ 02-13؛ به AI افزوده نشود |
| NV-02-12 | افزودن میزکارهای آینده | قرارداد ثبت، نمایش و فعال‌سازی میزکار بدون بازنویسی هسته | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | DESK؛ 00-03/04؛ D07 |
| NV-02-13 | استقلال و امکانات مشترک | مرز ماژول، سرویس مشترک تاریخ/اعلان/مجوز و مدیریت چرخهٔ عمر میزکار | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | DESK؛ پیش‌نیاز همهٔ میزکارهای جدید؛ D07 |

## 03 — تقویم و مناسبت‌ها

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-03-01 | Google Calendar | اتصال و همگام‌سازی واقعی، قطع اتصال، تعارض و مدیریت حذف | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | GOOGLE؛ 06-01/02،00-02،01-08؛ D08؛ ICS جایگزین sync نیست |
| NV-03-02 | مناسبت ادمین | ثبت/ویرایش مناسبت توسط ادمین و رسیدن به برنامهٔ آنلاین/آفلاین | P1 | [ ] Not Started | P | PHP:N / DJ:E | PHP:N / DJ:E | Pending | CALDATA؛ 00-04؛ PHP فعلاً جدول شروع ماه قمری دارد |
| NV-03-03 | مناسبت‌های باستانی | مجموعهٔ جداگانهٔ مورد تأیید با انتخاب نمایش و منبع ثبت‌شده | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | CALDATA؛ 03-02؛ D09؛ مقاله دربارهٔ جشن‌ها معادل تقویم نیست |
| NV-03-04 | اعلان مناسبت | فعال‌سازی اختیاری اعلان مناسبت با لغو/تغییر و تشخیص تکرار | P1 | [ ] Not Started | N | PHP:P / DJ:P | P | Pending | NOTIFY/CALDATA؛ 03-02،01-10؛ D09؛ پوشش 04 |
| NV-03-05 | تکرار پیشرفتهٔ ایونت | تکرار محدود، تاریخ مشخص و استثنا/ویرایش نوبت طبق قرارداد مصوب | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | RECUR؛ 01-08/09؛ D02 |

## 04 — اعلان و صدا

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-04-01 | صداهای جدید | دارایی صوتی محلی سبک و مجاز با رفتار واقعی در پلتفرم مقصد | P2 | [ ] Not Started | N | — | — | Pending | SOUND؛ D03؛ انتخاب منبع/مجوز پیش از افزودن فایل |
| NV-04-02 | انتخاب صدا | انتخاب و پیش‌شنوی صدا و ذخیرهٔ تنظیم با رعایت Notification Channel | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SOUND/PREF؛ 04-01؛ محدودیت صدای مرورگر مستند |
| NV-04-03 | توسعهٔ اعلان | قرارداد تحویل، وضعیت خطا/مجوز، retry، dedupe، سکوت و لغو | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | NOTIFY؛ 00-04،01-10/13/15 |
| NV-04-04 | پس‌زمینهٔ واقعی | وب با Push/cron، Android با scheduler پایدار و تست دستگاه واقعی | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | NOTIFY/NATIVE؛ صف فعلی ۷ روز؛ 00-02؛ D11 |

## 05 — طراحی و تجربهٔ کاربری

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-05-01 | بهبود UI همهٔ بخش‌ها | ممیزی و بهبود صفحات و حالت‌های خطا/خالی/بارگذاری و دسترس‌پذیری | P2 | [ ] Not Started | P | — | — | Pending | UI؛ پس از قرارداد رفتار هر بخش |
| NV-05-02 | تم جدید اول | طراحی مصوب اول و اجرای سازگار با دو زبان و modeها | P2 | [ ] Not Started | N | PHP:P / DJ:N | P | Pending | THEME؛ 05-04؛ D10؛ طراحی انتخاب نشده |
| NV-05-03 | تم جدید دوم | طراحی مصوب دوم با معیار پذیرش مستقل | P2 | [ ] Not Started | N | PHP:P / DJ:N | P | Pending | THEME؛ 05-04؛ D10؛ طراحی انتخاب نشده |
| NV-05-04 | زیرساخت تم | ثبت palette/mode/tokenها، ذخیره و fallback داده‌های قبلی | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | THEME؛ 00-04؛ Toojibee و Classic موجود |
| NV-05-05 | بهبود لندینگ | بهبود تجربه و محتوای مجاز، دو زبان، سبک و بدون درخواست خارجی | P2 | [ ] Not Started | E | PHP:E / DJ:P | P | Pending | SITE؛ D20؛ تغییر محتوایی قابل بررسی |
| NV-05-06 | UX میزکار اصلی | جریان ثبت/ویرایش/مرور برنامه متناسب با خط زمانی | P1 | [ ] Not Started | P | — | — | Pending | UI/PLAN؛ 01-01 تا 09؛ D01/D02 |
| NV-05-07 | UI میزکار تخصصی | الگوهای مشترک و کنترل‌های متناسب با هر میزکار | P2 | [ ] Not Started | P | — | — | Pending | UI/DESK؛ 02-13؛ D04 تا D07 |
| NV-05-08 | یکپارچگی طراحی | توکن‌ها و الگوهای مشترک در صفحات/تم‌ها/اندروید | P1 | [ ] Not Started | P | — | — | Pending | UI/THEME؛ 05-04؛ رفع پراکندگی رنگ و رجیستری |

## 06 — احراز هویت و موبایل

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-06-01 | ثبت‌نام Google | ساخت حساب با Google و تکمیل اطلاعات اجباری با جریان امن | P1 | [ ] Not Started | P | PHP:N / DJ:P | PHP:N / DJ:E | Pending | GOOGLE/AUTH؛ 00-03/05؛ OAuth واقعی آزموده نشده |
| NV-06-02 | ورود Google | ورود و اتصال حساب بدون ساخت حساب تکراری و بازگشت امن به اپ | P1 | [ ] Not Started | P | PHP:N / DJ:P | PHP:N / DJ:E | Pending | GOOGLE/AUTH؛ 06-01؛ WebView نیازمند جریان سیستم |
| NV-06-03 | توسعهٔ موبایل | تکمیل Android فعلی و دامنهٔ پلتفرم مصوب، OTA سازگار و دادهٔ محفوظ | P1 | [ ] Not Started | P | PHP:E / DJ:P | P | Pending | NATIVE؛ D11؛ فعلاً Android 1.4.0 |
| NV-06-04 | هماهنگی بین پلتفرم‌ها | پایداری داده/مجوز/تنظیم بین وب و موبایل و چند دستگاه | P0 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | SYNC؛ 00-02/03/04؛ D22 |
| NV-06-05 | تست پس‌زمینهٔ موبایل | تست مجوز، reboot، بستن، force-stop، آفلاین و تغییر ساعت | P1 | [ ] Not Started | P | PHP:P / DJ:P | — | Pending | NATIVE/QA؛ 04-04؛ دستگاه واقعی لازم؛ D11 |

## 07 — فروشگاه و درآمدزایی

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-07-01 | فروشگاه واقعی | کاتالوگ قابل خرید و نمایش وضعیت واقعی دسترسی | P2 | [ ] Not Started | P | PHP:N / DJ:P | P | Pending | BILLING؛ 07-02 تا 05؛ FEATURES.store=false؛ D12 |
| NV-07-02 | اشتراک پولی | چرخهٔ خرید، فعال‌سازی، تمدید و انقضای اشتراک قابل حسابرسی | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | BILLING؛ 00-03/04؛ D12/D13 |
| NV-07-03 | امکانات Premium | فهرست قابلیت‌های مصوب با رفتار درست پس از انقضا | P2 | [ ] Not Started | P | PHP:N / DJ:N | N | Pending | BILLING؛ 07-02/04/05؛ D12 |
| NV-07-04 | سطوح اشتراک | تعریف و نسخه‌گذاری سطح و entitlement مستقل از UI | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | BILLING؛ 00-03؛ D12 |
| NV-07-05 | کنترل دسترسی پولی | اعتبارسنجی سروری و سیاست آفلاین؛ مقاوم در برابر تغییر localStorage | P0 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | BILLING/AUTH؛ پیش‌نیاز فعال‌سازی پرداخت؛ D12 |
| NV-07-06 | خرید قابلیت ویژه | خرید و فعال‌سازی idempotent با تأیید درگاه و سناریوی خطا | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | BILLING؛ 07-02/05؛ D12/D13؛ خرید تکی هنوز تعیین نشده |

## 08 — هوش مصنوعی

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-08-01 | اتصال AI | تکمیل MCP فعلی، مدیریت کلید و اتصال قابل کنترل | P2 | [ ] Not Started | P | PHP:E / DJ:E | E | Pending | AI؛ 00-03/05؛ aiConnect=false؛ D14 |
| NV-08-02 | ابزارهای داخلی | اتصال ابزارهای AI به سرویس‌های معتبر برنامه، نه منطق UI | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | AI؛ 08-03،02-13؛ D14 |
| NV-08-03 | مجوز AI برای میزکارها | دسترسی granular و لغو آن؛ مرز اطلاعات شخصی/اشتراکی محفوظ | P0 | [ ] Not Started | N | PHP:P / DJ:P | N | Pending | AI/AUTH؛ 00-03؛ D14؛ period ممنوع |
| NV-08-04 | چت‌بات توجیبی | گفتگو با ابزارهای مجاز، خطا/هزینه/حریم خصوصی و کنترل تغییر داده | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | AI؛ 08-02/03/05/06؛ D14/D15 |
| NV-08-05 | شخصیت و لحن | تعریف و ارزیابی هویت، لحن و رفتار مشخص چت‌بات | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | AI؛ D15؛ هیچ شخصیت فرضی انتخاب نشده |
| NV-08-06 | چند مدل AI | adapter سروری قابل توسعه با مدیریت timeout، هزینه و اسرار | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | AI؛ D15؛ بدون SDK خارجی در مرورگر |

## 09 — ربات SEO

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-09-01 | ممیزی صفحات | جمع‌آوری وضعیت SEO صفحات مجاز و گزارش قابل بازتولید | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO؛ 00-03؛ D18؛ ربات فعلی وجود ندارد |
| NV-09-02 | کلمات کلیدی | تحلیل کلیدواژه بر اساس زبان/موضوع/دادهٔ واقعی و اعلام منبع | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO؛ 09-01/13؛ D18 |
| NV-09-03 | Metaها | بررسی title/description تکراری، ناقص یا نامتناسب و پیشنهاد اصلاح | P2 | [ ] Not Started | P | PHP:P / DJ:N | P | Pending | SEO؛ 09-01؛ وجود تگ معادل ممیز نیست |
| NV-09-04 | Headingها | تحلیل ساختار عنوان‌ها و گزارش مشکلات هر صفحه | P2 | [ ] Not Started | P | PHP:N / DJ:N | N | Pending | SEO؛ 09-01 |
| NV-09-05 | لینک داخلی | بررسی لینک شکسته، مقصد، پوشش و پیشنهاد لینک‌سازی | P2 | [ ] Not Started | P | PHP:N / DJ:N | N | Pending | SEO؛ 09-01 |
| NV-09-06 | تصویر و Alt | بررسی متن جایگزین و اندازه/فرمت/بارگذاری تصویر | P2 | [ ] Not Started | P | PHP:N / DJ:N | N | Pending | SEO؛ 09-01 |
| NV-09-07 | Sitemap و Robots | تطبیق نسخهٔ static/PHP، canonical و noindex و مسیرهای انتشار | P1 | [ ] Not Started | E | PHP:E / DJ:N | — | Pending | SEO/SITE؛ 09-01؛ /demo/ ایندکس نشود |
| NV-09-08 | وضعیت ایندکس | بررسی دادهٔ واقعی ایندکس و جداسازی از صرف قابلیت crawl | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO؛ 09-13؛ مالکیت Search Console لازم |
| NV-09-09 | Technical SEO | بررسی redirect، status، canonical، hreflang و دادهٔ ساخت‌یافته | P2 | [ ] Not Started | P | PHP:P / DJ:N | N | Pending | SEO/SITE؛ 09-01؛ بدون تغییر خودکار پرریسک |
| NV-09-10 | سرعت صفحات | اندازه‌گیری قابل تکرار عملکرد و بودجهٔ صفحه در محیط مشخص | P2 | [ ] Not Started | P | PHP:N / DJ:N | N | Pending | SEO/QA؛ 09-01؛ اندازهٔ فایل معادل Core Web Vitals نیست |
| NV-09-11 | پیشنهاد محتوا | پیشنهاد موضوع/متن سئوشده با منبع و بازبینی پیش از انتشار | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO/CONTENT؛ 09-02/15؛ AI در صورت انتخاب 08-06 |
| NV-09-12 | گزارش اولویت‌بندی | گزارش وضعیت/ریسک/اقدام و روند ترافیک و عملکرد ارگانیک | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO؛ 09-01 تا 10،13/14 |
| NV-09-13 | اتصال Search Console | adapter مجاز برای Search Analytics/URL Inspection و quota/error | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO/GOOGLE؛ D18؛ فایل verification اثبات اتصال نیست |
| NV-09-14 | اتصال Analytics | زیرساخت گزارش دادهٔ GA با مجوز؛ تعیین روش جمع‌آوری بدون نقض قرارداد | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | SEO/GOOGLE؛ D18/D19؛ آمار داخلی معادل GA نیست |
| NV-09-15 | تأیید اصلاح SEO | پیشنهاد تغییر، diff، تأیید مالک، ثبت اثر و امکان بازگشت | P0 | [ ] Not Started | N | PHP:P / DJ:N | N | Pending | SEO/CONTENT؛ پیش‌نیاز نوشتن ربات؛ دستور C08 |

## 10 — دوستان و همکاری

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-10-01 | اشتراک تسک | اشتراک کپی/زنده با افراد مجاز و رفتار ویرایش مشخص | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | SHARE؛ 00-03؛ لینک کپی موجود؛ D16 |
| NV-10-02 | اشتراک برنامهٔ روز | اشتراک روز با دسترسی مشخص و حفظ اطلاعات خصوصی | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | SHARE؛ 10-04؛ تصویر خلاصه موجود؛ D16 |
| NV-10-03 | اشتراک میزکار | اشتراک میزکار مصوب با لغو دسترسی و محدودیت داده | P2 | [ ] Not Started | N | PHP:P / DJ:P | N | Pending | SHARE/DESK؛ 02-13،10-04؛ D16 |
| NV-10-04 | مجوز اشتراک | نقش خواندن/ویرایش، دعوت، انقضا/لغو طبق قرارداد مالک | P0 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | AUTH/SHARE؛ 00-03؛ D16 |
| NV-10-05 | گروه معمولی | تکمیل ایجاد/دعوت/خروج گروه فعلی و سازگاری قدیمی | P2 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | GROUP؛ D17 |
| NV-10-06 | فعالیت مشترک | برنامه‌ریزی تسک/عادت/ایونت مشترک با انجام فردی/مشترک | P2 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | GROUP؛ 10-05؛ D17 |
| NV-10-07 | گروه‌بندی برنامه‌ها | ساختار موردنظر برای دسته‌بندی برنامه‌ها داخل گروه | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | GROUP؛ D17؛ مفهوم دقیق هنوز مشخص نیست |
| NV-10-08 | اعضا و دسترسی | حفظ و توسعهٔ owner/admin/member با آزمون مرزهای دسترسی | P1 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | GROUP/AUTH؛ 00-03؛ D17 |
| NV-10-09 | تقسیم مسئولیت سوپرگروه | تعریف مسئولیت و نقش همکاری پیشرفته | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | GROUP؛ 10-08؛ D17 |
| NV-10-10 | تخصیص وظیفه | اختصاص وظیفه به عضو/اعضا طبق مدل مصوب | P2 | [ ] Not Started | N | PHP:N / DJ:N | N | Pending | GROUP؛ 10-09؛ D17 |
| NV-10-11 | پیشرفت وظایف | وضعیت‌های پیشرفت، تاریخچه و نمایش مشترک | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | GROUP؛ 10-10؛ تیک فعلی معادل workflow نیست؛ D17 |
| NV-10-12 | مدیریت فعالیت پیشرفته | مدیریت فعالیت‌های مشترک در ساختار سوپرگروه | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | GROUP؛ 10-09 تا 11؛ D17 |
| NV-10-13 | هماهنگی اعضا | نمای هماهنگی و اعلان‌های موردنیاز اعضا | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | GROUP/NOTIFY؛ 10-12،01-10؛ D17 |

## 11 — مقالات

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-11-01 | بخش مقالات | تکمیل بخش موجود در اپ/سایت و سازگاری مسیر انتشار | P2 | [ ] Not Started | E | PHP:E / DJ:N | PHP:E / DJ:N | Pending | CONTENT؛ D20؛ قابلیت از قبل موجود است |
| NV-11-02 | نمایش مقاله | فهرست/صفحهٔ مقالهٔ منتشرشده و حالت‌های خطا/زبان/خالی | P2 | [ ] Not Started | E | PHP:E / DJ:N | PHP:E / DJ:N | Pending | CONTENT؛ 11-01؛ بازبینی دامنهٔ تغییر |
| NV-11-03 | دسته‌بندی محتوا | تکمیل دسته‌بندی فعلی و فیلتر/مسیریابی موردنیاز | P2 | [ ] Not Started | P | PHP:E / DJ:N | PHP:E / DJ:N | Pending | CONTENT؛ 11-01؛ D20 |
| NV-11-04 | مدیریت و انتشار ادمین | حفظ draft/pending/published/rejected، نقش نویسنده/بازبین و انتشار | P2 | [ ] Not Started | E | PHP:E / DJ:N | PHP:E / DJ:N | Pending | CONTENT؛ 00-03؛ D20؛ پنل موجود بازاستفاده شود |
| NV-11-05 | SEO مقاله | متادیتا، لینک‌ها، slug/redirect و حضور درست در sitemap | P2 | [ ] Not Started | E | PHP:E / DJ:N | PHP:E / DJ:N | Pending | CONTENT/SEO؛ 11-01،09-07/09؛ پوشش regression لازم |

## 12 — پروفایل

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-12-01 | توسعهٔ پروفایل | تکمیل نمای پروفایل و جریان‌های کاربر با دامنهٔ مصوب | P2 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | PROFILE؛ D21 |
| NV-12-02 | اطلاعات کاربر | مدیریت فیلدها و اعتبارسنجی و نمایش خطای صحیح | P1 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | PROFILE/AUTH؛ 00-03؛ D21 |
| NV-12-03 | اشتراک برنامه از پروفایل | اتصال پروفایل به اشتراک برنامه و کنترل دسترسی | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | PROFILE/SHARE؛ 10-02/04؛ D16 |
| NV-12-04 | مدیریت ارتباطات | حفظ دوستان/دعوت/بلاک و یکپارچگی با گروه‌ها | P1 | [ ] Not Started | E | PHP:E / DJ:E | E | Pending | PROFILE/GROUP؛ 10-08 |
| NV-12-05 | مدیریت میزکار کاربر | فعال‌سازی/ترتیب/تنظیم میزکارها با حفظ داده در غیرفعال‌سازی | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | PROFILE/DESK؛ 02-12/13؛ D07 |

## 13 — ساختار پانزده‌بخشی محصول

| ID | Feature | Description | Priority | Status | Frontend | Backend | Database | Testing | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NV-13-01 | مدیریت زمان | جانمایی قابلیت مدیریت زمان و ارتباط آن با برنامه/تایمر | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | DESK/PLAN؛ D07؛ نام بخش تعهد به امکانات نامشخص نیست |
| NV-13-02 | جستجوی گسترده | توسعهٔ جستجوی موجود مناسبت/ایونت به دامنهٔ مصوب با کنترل دسترسی | P2 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | SEARCH؛ 00-03،02-13؛ D21 |
| NV-13-03 | ناوبری بخش‌ها | تطبیق پانزده بخش خواسته‌شده با navigation و lifecycle میزکار | P1 | [ ] Not Started | P | PHP:P / DJ:P | P | Pending | DESK/UI؛ جدول تطبیق AUDIT؛ D07 |
| NV-13-04 | تنظیمات | یکپارچه‌سازی تنظیمات جدید با تنظیمات فعلی و sync صحیح | P1 | [ ] Not Started | E | PHP:P / DJ:E | P | Pending | PREF؛ 00-02/04؛ D21 |

## پوشش تکرارها و محدودیت‌ها در متن اصلی

| بند درخواست | مرجع اصلی چک‌لیست |
|---|---|
| 03: ثبت ایونت گذشته | NV-01-05 |
| 04: هماهنگی اعلان با تکرار تسک/ایونت | NV-01-10 و NV-03-05 |
| 04: اعلان مناسبت | NV-03-04 |
| 04: آلارم پایان فعالیت | NV-01-15؛ دامنهٔ فعالیت در D03 روشن می‌شود |
| 06: عملکرد پس‌زمینه | NV-04-04 و NV-06-05 |
| 07: عدم تأیید تبلیغات | C05 در DECISIONS؛ هیچ پیاده‌سازی تبلیغ در برنامه نیست |
| بخش سوم: ۱۵ بخش محصول | جدول پانزده‌ردیفی AUDIT؛ NV-13-03 یکپارچگی ناوبری را دنبال می‌کند |
| بخش چهارم: حفظ داده، Migration، امنیت، تست و گزارش واقعی | NV-00-02 تا 07 و دروازهٔ پذیرش هر ردیف |
| بخش پنجم: اجرای تمام نیازمندی‌ها و بازبینی تک‌تک | تمام ردیف‌ها + NV-00-07؛ شروع اجرا هنوز مجاز نشده است |
| بخش ششم: سؤال‌های ضروری و به‌روزرسانی پیوسته | DECISIONS + قرارداد README + CHANGELOG |

## شواهد پذیرش لازم برای هر قابلیت

قبل از Awaiting User Review، برای همان ID در TEST_REPORT ثبت شود: مسیر کاربر و دادهٔ ورودی؛ نتیجهٔ مورد انتظار/واقعی؛ هر دو API client و بک‌اندهای لازم؛ migration/backfill و دادهٔ قدیمی؛ ownership/validation؛ خطا/timeout/offline/retry؛ آزمون ۳۶۰ و ۱۲۸۰، fa/en و روشن/تاریک در صورت UI؛ Android/پس‌زمینه در صورت نیاز؛ محدودیت سرویس خارجی. صرف وجود کد یا موفقیت تست‌های نامرتبط کافی نیست.
