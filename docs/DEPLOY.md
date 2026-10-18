# DEPLOY — راهنمای انتشار وب‌سایت آوند

> این پروژه هیچ build step ای نداره (HTML/CSS/JS خام). انتشار یعنی صرفاً
> کپی‌کردن فایل‌های درست روی هاست.

---

## ۱. چی روی هاست بره

فقط محتوای پوشه‌ی `frontend/` — همون‌طور که هست، بدون build:

```
frontend/
  index.html  robots.txt  sitemap.xml
  en/  fa/  demo/  assets/
```

**این‌ها روی هاست نرن:** `backend/`، `database/`، `docs/`، `CLAUDE.md`،
`.git/` و `.github/`.

---

## ۲. دامنه‌ها

- **`.ir` دامنه‌ی اصلی (canonical)** — تمام تگ‌های `canonical`، `hreflang` و
  `og:url` در HTML به `https://toojibee.ir/...` اشاره می‌کنن.
  > ✅ **`toojibee.ir` تأیید شد** (دامنه‌ای که صاحب پروژه خرید، ۲۰۲۶-۱۰-۱۸).
  > همه‌ی فایل‌های HTML، `robots.txt` و `sitemap.xml` روی همین آدرس‌ان.
  > `.com` فقط اگه خریده بشه به `.ir` ریدایرکت می‌شه.
- **`.com` باید با ریدایرکت دائمی ۳۰۱ به همون آدرس روی `.ir` بره** —
  این کار روی سطح DNS/هاست انجام می‌شه (مثلاً یه قانون در Nginx یا پنل
  دامنه)، نه با کد سمت سایت. نمونه‌ی Nginx:
  ```nginx
  server {
    listen 443 ssl;
    server_name toojibee.com www.toojibee.com;
    return 301 https://toojibee.ir$request_uri;
  }
  ```

---

## ۳. SSL

- گواهی رایگان Let's Encrypt (یا معادل ارائه‌شده توسط هاست) روی هر دو
  دامنه (`.ir` و `.com`) فعال بشه.
- HTTP باید به HTTPS ریدایرکت بشه (۳۰۱)، نه فقط این‌که HTTPS کار کنه.

---

## ۴. ریدایرکت زبان پیش‌فرض

طبق `SPEC.md` §۴، ریشه‌ی `/` خودش یه صفحه‌ی مینیمال انتخاب زبانه (نه
ریدایرکت سمت سرور). یعنی **نیازی به قانون ریدایرکت جدا روی هاست نیست** —
`index.html` خودش این نقش رو بازی می‌کنه. فقط مطمئن بشید هاست فایل
`index.html` ریشه رو به‌عنوان صفحه‌ی پیش‌فرض سرو می‌کنه (رفتار استاندارد
اکثر هاست‌های استاتیک).

---

## ۵. Cache-Control برای assets

چون فایل‌های `assets/css`, `assets/js`, `assets/icons` و (بعداً)
`assets/fonts` بدون versioning/hash در نامشون هستن، یه cache نسبتاً کوتاه
با revalidation امن‌تره تا کاربر بعد از هر آپدیت، فایل قدیمی cache‌شده رو
نبینه:

```
/assets/*      Cache-Control: public, max-age=86400, must-revalidate
/*.html        Cache-Control: no-cache
/robots.txt    Cache-Control: public, max-age=3600
/sitemap.xml   Cache-Control: public, max-age=3600
```

اگه بعداً فایل‌نام‌ها hash-versioned شدن (مثلاً `site.a1b2c3.css`)، اون‌موقع
می‌شه `max-age` رو خیلی بلندتر (مثلاً یک سال، `immutable`) گذاشت.

نمونه‌ی Nginx:
```nginx
location /assets/ {
  add_header Cache-Control "public, max-age=86400, must-revalidate";
}
```

---

## ۶. چک‌لیست بعد از انتشار

- [ ] `https://toojibee.ir/` باز می‌شه و صفحه‌ی انتخاب زبان رو نشون می‌ده
- [ ] `https://toojibee.ir/fa/` و `/en/` هر دو لود می‌شن، RTL/LTR درسته
- [ ] `https://toojibee.com/` با ۳۰۱ به `https://toojibee.ir/` ریدایرکت می‌شه
- [ ] HTTP هر دو دامنه به HTTPS ریدایرکت می‌شه
- [ ] `robots.txt` و `sitemap.xml` روی هر دو دامنه در دسترسن
  (`/robots.txt`, `/sitemap.xml`)
- [ ] `/demo/` باز می‌شه و در Google با `noindex` ایندکس نمی‌شه (چک با
  Google Search Console بعد از چند روز) — نوار «پیش‌نمایش» عمداً حذف
  شده (تصمیم آگاهانه، SPEC.md §11.9)، نبودنش طبیعیه نه باگ
- [ ] `/fa/about/`, `/fa/privacy/`, `/fa/terms/`, `/fa/download/` (و
  معادل انگلیسی‌شون) باز می‌شن، نه ۴۰۴
- [ ] سوییچ تم و زبان روی نسخه‌ی زنده کار می‌کنه (نه فقط لوکال)
- [ ] هیچ درخواست شبکه‌ی خارجی در تب Network مرورگر دیده نمی‌شه
- [ ] دکمه‌ی دانلود APK — وقتی فایل واقعی آماده شد، `assets/js/config.js`
  (`download.ready = true`) و مقادیر `{{APP_VERSION}}` /
  `{{BUILD_DATE}}` / `{{FILE_SIZE_MB}}` / `{{SHA256}}` در دو صفحه‌ی
  `download/index.html` با مقدار واقعی جایگزین بشن

---

## ۷. انتشار خودکار (GitHub Pages)

`.github/workflows/pages.yml` با هر push روی `master` فقط پوشه‌ی
`frontend/` رو روی GitHub Pages منتشر می‌کنه. پیش‌نیاز: در
Settings → Pages، گزینه‌ی Source روی **GitHub Actions** باشه.

برای هاست دیگه (مثلاً سرور ایرانی)، کافیه محتوای `frontend/` آپلود بشه.

---

## ۸. هاست لینوکس ایران‌هاست (اشتراکی، cPanel/DirectAdmin)

**سایت و اپ (بدون بک‌اند):**
1. بسته رو بساز: `powershell -ExecutionPolicy Bypass -File deploy\build-site-zip.ps1`
   → `dist/toojibee-site.zip` (ساختش با اسکریپت مهمه: زیپ پیش‌فرض ویندوز
   مسیرها رو با `\` می‌نویسه و روی لینوکس خراب باز می‌شه).
2. تو پنل هاست → File Manager → پوشه‌ی `public_html` (یا `domains/toojibee.ir/public_html`
   در DirectAdmin). فایل‌های پیش‌فرض هاست (`index.html`/`default.html`) رو پاک کن.
3. زیپ رو آپلود کن و همون‌جا Extract کن؛ باید `index.html`، `.htaccess`،
   `fa/`، `en/`، `demo/`، `assets/` مستقیم داخل `public_html` باشن (نه یه پوشه پایین‌تر).
4. SSL رایگان (Let's Encrypt / AutoSSL) رو از پنل برای `toojibee.ir` و `www.toojibee.ir` فعال کن.
   `.htaccess` خودش HTTP و www رو به `https://toojibee.ir` می‌بره.
5. DNS: تو پنل ایرانیک، نیم‌سرورهای دامنه رو همونایی بذار که ایران‌هاست تو ایمیل خوش‌آمد داده.

**بک‌اند جنگو:** روی هاست اشتراکی فقط وقتی شدنیه که پنل بخش «Setup Python App»
(Passenger) و «MySQL Databases» داشته باشه؛ وگرنه یه سرور مجازی لازمه.
تا اون موقع `demo/js/config.js` با `apiBase` خالی می‌مونه و اپ آفلاین کار می‌کنه.
