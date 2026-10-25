# Toojibee marketing website

## What this is
Static, bilingual (fa/en) landing site for Toojibee (formerly "Avand", renamed
2026-10-09 at the repo owner's request — see git history/commits for the rename),
a time-based personal-development app.
Two primary CTAs: web app and "Download for Android". Project docs are in /docs.
Read the relevant doc before any big change.

**Start every change request with docs/CHANGES.md** (code map, which
surfaces a request must reach — site, web app, Android, PHP API, Django,
DB — current versions, and a change log). After each change, add a log entry
there and update the versions/map, so later sessions don't re-read the code.

## Repo layout (2026-10-15)
- frontend/ — everything that is published (GitHub Pages deploys only this
  folder via .github/workflows/pages.yml). Site-root paths below such as
  /assets/ or /demo/ mean frontend/assets/, frontend/demo/.
  - frontend/demo/ — the app prototype, split into css/, js/core/,
    js/services/api.js (API client), js/config.js (apiBase), js/app.js and
    components/<name>/ (html partial + css + js per component). See
    frontend/demo/README.md before editing.
- android/ — the Android app (2026-10-25): the web app (frontend/demo) in a
  WebView plus a thin Kotlin layer (no libraries) for offline files,
  over-the-air file updates (demo/app-files.json from build-site-zip.ps1),
  phone-scheduled reminders, share/back/status bar. Package ir.toojibee.app,
  Android 7+. Build: deploy/build-android.ps1; release key:
  deploy/make-keystore.ps1 (the repo owner's, never committed). See
  android/README.md. The live CSS bundle gets old-WebView fallbacks
  (deploy/css-compat.js, js/core/compat.js).
- backend/ — Django 5.2 + DRF API, one Django app and one MySQL database per
  module (core, calendar_data, planning, period, social, notifications); not
  deployed yet. See backend/README.md. Tests: `python manage.py test apps
  --settings=config.settings.test` (SQLite, no MySQL needed).
- database/ — one-time MySQL setup (databases + least-privilege users,
  setup.sql); tables come from Django migrations. See database/README.md and
  docs/DATABASE-PLAN.md.
- docs/ — product docs, SPEC.md, DEPLOY.md, DATABASE-PLAN.md.
- The "no npm packages / no build step" rules below are about the published
  frontend only; backend/ is a normal Python project (requirements.txt).

## Hard rules
- Plain HTML, CSS and vanilla JS. No frameworks, no npm packages, no build step.
- ZERO external requests at runtime: no CDNs, no Google Fonts, no analytics, no
  third-party scripts. Fonts must be self-hosted in /assets/fonts — never
  linked from Google Fonts or any CDN.
  Status (2026-10-18): ONE font for the whole site and app, both languages —
  Baloo Bhaijaan 2 (SIL OFL, variable 400–800), assets/fonts/baloo-bhaijaan-2/
  (Arabic-script file + Latin file, split by unicode-range), declared in
  tokens.css and demo/css/base.css. Chosen by the repo owner over Vazirmatn,
  Estedad, Sahel, Samim, Mikhak and others. The earlier SG Kara (fa, Light
  only) and Inter (latin) files are still in assets/fonts but unused.
- Audience is in Iran on a slow, filtered network. Keep pages light (target: under
  300 KB per page excluding fonts). Prefer SVG or WebP, lazy-load images.
- Daily occasions (مناسبت‌ها, demo/'s اصلی desktop pane) use a self-hosted static
  dataset, /assets/data/occasions.json — a one-time download of
  github.com/BaseMax/persian-holidays-api's holidays.json (238 entries, Jalali/
  Gregorian/Hijri), fetched once from this app's own origin at boot and cached in
  memory (loadOccasionsData() in demo/js/core/occasions.js). Not a live third-party API call —
  that would break the zero-external-requests rule above. Hijri dates use Iran's
  official month starts (moon sighting), /assets/data/hijri-months.json, with
  arithmetic only as a fallback. When the demo has a backend, both come from its
  /calendar/ API instead (same data, kept up to date in the Django admin).
  time.ir has no public API; it is a feature reference only, never fetched.
- Every color, spacing and radius comes from CSS variables in /assets/css/tokens.css.
  Never hardcode colors anywhere else.
- Brand mark (2026-10-22, the repo owner's new "Tj road" concept): drawn ONCE, as
  vectors, in deploy/make-logo.js, which writes every logo SVG (logo.svg, favicon.svg,
  logo-header(-dark).svg, logo-mark.svg, og-image.svg) — light: cream mark with orange
  road lines on a forest circle; dark header: olive mark on an orange circle. The PNG
  sizes (favicon-48, apple-touch-icon, icon-192/512, logo-mark, og-image) are rendered
  from those SVGs with headless Chrome, and frontend/favicon.ico (16–64 px, made with
  Pillow from icon-512.png; search engines ask for /favicon.ico). Change the drawing
  there, re-run, re-render. Every icon/og-image URL carries ?v=tj5 — bump it so caches
  drop an old logo.
- /demo/ holds the HTML prototype. It must have noindex. noindex still applies, and the
  marketing site (outside /demo/) must still never describe it as the finished product.
  The visible "this is a preview" banner was removed by explicit product decision (SPEC.md §11.9).
  Status (conscious exception, updated 2026-10-15): /demo/ may make requests to the
  project's OWN backend only — the Django API in backend/ (demo/js/services/api.js, plain
  fetch, no SDK, no CDN), set via apiBase in demo/js/config.js. Supabase was dropped at the
  repo owner's request. While apiBase is empty (as on GitHub Pages until the API is
  deployed) the demo runs fully offline without sign-in (REAL_LOGIN_DISABLED in js/app.js
  follows it). Google sign-in is a server-side redirect flow (the page only navigates;
  no Google script is ever loaded). This exception is /demo/-only: the marketing site
  (index.html, /en/, /fa/) still makes zero external requests, full stop.
- Domains: toojibee.ir is canonical (bought by the repo owner, 2026-10-18; every
  canonical/hreflang/og:url, robots.txt and sitemap.xml use it); a .com, if
  bought, redirects to it.

## Product claims
- The marketing site (index.html, /en/, /fa/ — everything outside /demo/) only
  advertises MVP features: Task, Habit, Event, Calendar, reminders (see
  docs/avand_phase2_v1.md and docs/avand_mvp-scope-amendments_v1.md). Do NOT
  advertise Reports/Charts, AI, Challenge, Journal, Tool Store or Social there.
  Exception (repo owner, 2026-10-22): the landing's "desks" section also
  describes the live app's Occasions desk, Period desk and Friends page
  (invite link, find by username/TJ- code, sharing the period cycle) —
  only what the app really does, nothing beyond.
- /demo/ itself is an exception by explicit, conscious decision (SPEC.md §11.9):
  it now also includes Social (Friends/Connections) and a Tool Store-style
  Feature Center, deliberately going beyond the docs' original MVP scope for
  demo/prototyping purposes. That expansion is /demo/-only — it does not change
  what the marketing site is allowed to claim. Same for the "Group planning"
  desk (repo owner, 2026-10-25): groups of friends sharing tasks, habits and
  events (js/core/groups.js, components/groups/, lib/groups.php,
  apps/social/groups.py).
- Do not name competitors in copy. Do not invent numbers, testimonials or user counts.
- If something is not in /docs, ask me instead of guessing.

## Design system (docs/avand_phase4-designsystem_v1.md)
- Status (2026-10-18): marketing-site palette replaced at the repo owner's
  request with https://colorhunt.co/palette/2e29102c5745ebe3a7eb7d00 —
  primary #EB7D00 (orange; every button, both themes, olive text on it for
  contrast), secondary #2C5745 (forest; brand-mark circle, CTA band), olive
  #2E2910 (light-mode text, dark-mode canvas), cream #EBE3A7 (light canvas,
  dark text). The previous navy/orange palette (coolors 000000-14213d-
  fca311-e5e5e5-ffffff) is kept in the demo as the "Classic" theme option.
  The docs/avand_phase4-designsystem_v1.md file still describes the
  original blue palette; tokens.css is the source of truth.
- Minimal and serious mood, rounded corners, filled icons.
- Digits: Persian digits (۰-۹) in /fa/ copy, Latin digits in /en/. The app's Design
  System uses Latin digits; this is a deliberate site-only difference.
- Light and dark mode are both required.

## Language
- /fa/ is RTL, /en/ is LTR. Separate static pages with the same structure,
  hreflang tags, language switch in the header.
- Copy is kept in one clearly marked place per page so it can be edited without
  touching layout.

## Workflow
- Work in small steps. After each working step: preview, verify, then commit.
- For anything touching many files, propose a plan first and wait for approval.
- Verification: check at 360px and 1280px, both themes, both languages, and confirm
  there are no external network requests.
