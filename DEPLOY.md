# DEPLOY — راهنمای انتشار وب‌سایت آوند

> این پروژه هیچ build step ای نداره (HTML/CSS/JS خام). انتشار یعنی صرفاً
> کپی‌کردن فایل‌های درست روی هاست.

---

## ۱. چی روی هاست بره

فقط این‌ها (خروجی اسکریپت `scripts/build-dist.ps1` در پوشه‌ی `dist/`):

```
index.html
robots.txt
sitemap.xml
en/
fa/
demo/
assets/
```

**این‌ها روی هاست نرن:**
- `docs/` (اسناد داخلی، نه بخشی از سایت)
- `SPEC.md`, `DEPLOY.md`, `CLAUDE.md` (مستندات مخزن)
- `.git/`, `.gitignore`
- هر فایل QA/dev موقت (مثل `styleguide.html` اگه بعداً ساخته بشه)

---

## ۲. دامنه‌ها

- **`.ir` دامنه‌ی اصلی (canonical)** — تمام تگ‌های `canonical`، `hreflang` و
  `og:url` در HTML به `https://avand.ir/...` اشاره می‌کنن.
  > ⚠️ **`avand.ir` فرض شده، نه تأییدشده.** اگه دامنه‌ی واقعی چیز دیگه‌ایه،
  > قبل از انتشار باید توی همه‌ی فایل‌های HTML + `robots.txt` +
  > `sitemap.xml` جایگزین بشه (یه `grep -rl "avand.ir"` روی `dist/` کل
  > مواردی که باید عوض بشن رو نشون می‌ده).
- **`.com` باید با ریدایرکت دائمی ۳۰۱ به همون آدرس روی `.ir` بره** —
  این کار روی سطح DNS/هاست انجام می‌شه (مثلاً یه قانون در Nginx یا پنل
  دامنه)، نه با کد سمت سایت. نمونه‌ی Nginx:
  ```nginx
  server {
    listen 443 ssl;
    server_name avand.com www.avand.com;
    return 301 https://avand.ir$request_uri;
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

- [ ] `https://avand.ir/` باز می‌شه و صفحه‌ی انتخاب زبان رو نشون می‌ده
- [ ] `https://avand.ir/fa/` و `/en/` هر دو لود می‌شن، RTL/LTR درسته
- [ ] `https://avand.com/` با ۳۰۱ به `https://avand.ir/` ریدایرکت می‌شه
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

## ۷. اسکریپت ساخت dist/

`scripts/build-dist.ps1` یه کپی تمیز از فایل‌های واقعی سایت (بدون
`docs/`, `SPEC.md`, `CLAUDE.md`, `DEPLOY.md`, `.git`) رو داخل `dist/`
می‌سازه. بدون npm، فقط PowerShell:

```powershell
./scripts/build-dist.ps1
```

خروجی توی `dist/` همون چیزیه که باید روی هاست آپلود بشه (بخش ۱).
