# Toojibee — change log and code map

Read this file first instead of re-reading the whole codebase. Every change
request adds one entry at the top of the log below (newest first) and, if it
adds a new file or layer, updates the map.

## Where each request has to land

A request names what it is for; decide which surfaces it touches:

| Surface | Lives in | Notes |
|---|---|---|
| Marketing site | frontend/index.html, frontend/fa/, frontend/en/, frontend/assets/ | MVP claims only (CLAUDE.md "Product claims"); zero external requests |
| Web app | frontend/demo/ | components/<name>/ (html+css+js), js/core/, js/services/ |
| Android app | android/ | WebView of frontend/demo + Kotlin in app/src/main/java/ir/toojibee/app/; gets demo files over the air (demo/app-files.json), so most app changes are web-app changes |
| Live API (PHP) | backend-php/ → public_html/api/ | lib/*.php per module; schema migrations in lib/bootstrap.php (`if ($v < N)`) |
| Django API | backend/apps/<module>/ | not deployed; kept in step with PHP (models, migrations, serializers, tests) |
| API clients | frontend/demo/js/services/api-php.js (live), api.js (Django) | both need the same mapping |

Checklist per feature: UI (fa + en strings in js/core/i18n.js, both themes,
360/1280 px) → PHP endpoint + migration → Django model + migration + test →
both API clients → offline behavior (no apiBase) → Android if it needs native
code → bump demo asset version (`?v=` in frontend/demo/index.html) → commit,
push, deploy (deploy/build-site-zip.ps1; Android: deploy/build-android.ps1).

## Code map

- Web app core (frontend/demo/js/core/): state.js (app state), render.js,
  events.js, i18n.js (all strings), dates.js / calendars.js (Jalali, Hijri,
  Gregorian), occasions.js, groups.js, trackers.js (habit counter/timer),
  notify.js (reminders/push), android.js (bridge to Kotlin), local-store.js,
  search.js, include.js (loads component partials), compat.js (old WebViews).
- Web app components: app-error, articles, auth, banner, birthday, calendar,
  contact, date-picker, day-sheet, groups, items, menu, notices, period,
  popup, toolbar, tour, workspace.
- PHP lib: auth, sync (the user's synced document), social, groups, push,
  notices, calendar, dates, content, articles, page (SEO page builder), mail,
  support, admin*, bootstrap (config, DB, schema).
- Django apps: core, calendar_data, planning, period, social, notifications
  (+ common).
- Android Kotlin: MainActivity, AppWeb, WebFiles (offline/OTA files),
  Reminders, PhoneActions, Widgets.
- Deploy scripts (deploy/): build-site-zip.ps1, build-android.ps1,
  make-keystore.ps1, make-logo.js, make-desk-shots.js, make-quotes.py, webp.py,
  css-compat.js.

## Current versions

Update these with every change.

- Demo asset version: 2026-10-26.5
- PHP schema: v23
- Django latest migrations: core 0008, planning 0006, social 0003,
  notifications 0003, calendar_data 0002, period 0001
- Android: 1.1.0 (versionCode 2)

## Log (newest first)

Format: `date — surfaces — what changed (key files)`.

- 2026-10-26.5 — web app (so Android too), PHP, Django — 
  * Time picker (js/core/dropdown.js enhanceTime): every minute, hour and
    minute columns loop. A one-time task's "at a time" reminder (input
    data-base/data-span, popup.js reminderSpans) lists hours from now only,
    on past midnight up to 7 days (day labels); a later day is saved as
    notification.date and stretches the task to a range up to that day, so
    it isn't overdue first. notify.js fires it only on that day. Django
    Task.reminder_date (planning 0006 + check constraint + test); PHP keeps
    it in the synced document.
  * Browser sign-in lasts until the tab/browser closes: session in
    sessionStorage (api.js sessionStore(), also used by api-php.js; an old
    localStorage session moves over once; account cache cleared when
    signed out that way). Android app keeps localStorage.
    assets/js/buttons.js reads both.
  * Email confirmation is back: register returns {verify_required, email}
    and emails a code; login of an unconfirmed account → 403
    email_not_verified + a code (old accounts too, once). POST
    /auth/email/code → tokens, /auth/email/code/resend. PHP lib/auth.php +
    v1/index.php, Django services/accounts.py + views/urls + tests (test
    helper signs up through the code). auth.js verify-code view with a
    spam-folder note. PHP mail gets Date/Message-ID headers (SPF, DKIM,
    DMARC already in DNS).
  * Classic palette, day mode: white header, navy logo
    (assets/icons/logo-navy.svg from deploy/make-logo.js; theme.css).
  * Planning is always the first desk for an account (workspace.js
    deskKeys); its on/off switch and the settings rows for calendar dots,
    events and habits in the day plan were removed (always on).
  * Photos picked in the app become WebP (util.js imageToWebp: 1280 px,
    avatar 512 px). Site images were already WebP; only icons stay PNG.

- 2026-10-26.4 — web app, Android 1.1.0, download pages — speed: render()
  rebuilds only pages whose HTML changed (render.js setPageHtml), no blur on
  weak phones (html[data-lite], theme.css), splash + WebView pre-raster;
  reminder buttons «انجام شد» / «بعداً یادم بنداز» with ticks applied while
  the app is closed (PhoneActions.kt: hidden page as a JobService;
  applyPhoneActions in android.js; api-php.js syncNow); four home-screen
  widgets: date, month, planning desk (tickable), period ring (Widgets.kt,
  widgetData in android.js). No PHP/Django change (ticks go through the
  synced document as usual).
- 2026-10-25 — docs — this file started.
- Uncommitted in the working copy at that time (not written by this entry):
  backend-php/mcp.php and .htaccess (MCP probe, another session).
- 2026-10-26.3 — web app, PHP, Django — habit counter and timer
  (trackers.js; Habit.tracker + HabitLog.value, planning 0005).
- Android 1.0.0 — signed APK on the download page.
- 2026-10-26.2 — web app, PHP v23, Django social 0003 — group admins, group
  tiles and page, in-app confirm.
- 2026-10-26.1 — web app, PHP v22, Django social 0002 — group planning desk
  (groups.js, components/groups/, lib/groups.php, apps/social/groups.py).
- Android app added (android/).
- PHP v20–v21 — article slugs and titles.
- 2026-10-25.2 — web app, Django — repeating reminders before tasks/events.
- 2026-10-24.3 — panel, PHP v18–v19, Django Notice — admin permissions,
  user filters, messages to users.
- Older history: `git log`.
