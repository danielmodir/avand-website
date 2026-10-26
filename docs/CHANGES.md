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

- Demo asset version: 2026-10-27.5
- PHP schema: v24
- Django latest migrations: core 0008, planning 0007, social 0003,
  notifications 0003, calendar_data 0002, period 0001
- Android: 1.3.0 (versionCode 4)

## Log (newest first)

Format: `date — surfaces — what changed (key files)`.

- 2026-10-27 — Phase 3.5 (web app, Android) — Settings → Backup & transfer
  (menu sub 'settings-backup'): js/core/backup.js buildIcs/parseIcs/
  parseBackup/planImport, preview + dedupe, period only in the JSON backup
  when ticked (warned). saveTextFile(): browser download, or the new Android
  bridge saveFile(name, mime, text) (ACTION_CREATE_DOCUMENT, APK 1.4+; old
  APKs share text under 10k chars). Period export uses it too.
  tests/backup.test.js. Next: 3.6 share cards.

- 2026-10-27 — Phase 3.4 (web app) — Profile → Date tools (menu sub
  'date-tools'): js/core/date-tools.js convertDate (any of the 3 calendars,
  round-trip checked), dateSpan (days + y/m/d), age with days to the next
  birthday; tests/date-tools.test.js runs calendars.js in node:vm. Next: 3.5
  import/export.

- 2026-10-27 — Phase 3.3 (web app, Django, both clients) — event.kind
  '' | 'birthday' (yearly, past date allowed) | 'countdown' (presets
  Konkur/Exam/Nowruz): popup.js eventKindRow/applyEventKind; items.js
  eventDaysLeft/eventBadgeHtml/countdownsHtml (Occasions desk); date widget
  occ line gets the next countdowns (android.js); reminder 09:00 by default.
  Django planning 0007_event_kind. Next: 3.4 date tools.

- 2026-10-27 — Phase 3.1–3.2 (web app, Django pref, Android widget layout) —
  prayer times: js/core/prayer.js (offline, Tehran Geophysics angles, 36
  cities), prayerBlockHtml in workspace.js (Occasions desk + day sheet),
  adhan slots in notify.js, settings under Occasions, widget line `pray`
  (needs APK 1.4), tests/prayer-times.test.js. Day sheet shows every
  calendar's date. Next: 3.3 birthdays/countdowns (not started).

- 2026-10-27 — growth spec Phase 2 (web app, Android 1.3.0, PHP, Django,
  privacy pages, panel) — details per task in REPORT.md, user-facing text
  in CHANGELOG.md. Map: backups off (AndroidManifest, res/xml/*_rules);
  bridge trusts only the app's page + argument checks (AppWeb.kt,
  MainActivity.kt); app lock (MainActivity askUnlock, bridge setLock /
  lockOn); period privacy section (period.js renderPeriodSettings,
  appLockOn/exportPeriodData/deleteAllPeriodData; localOnly in
  api-php.js / api.js; discreet texts in notify.js / android.js); invite
  approval (pref inviteApprove; social.php
  tj_social_invite_needs_approval; Django services.invite_needs_approval);
  sync dot (Cloud.syncPending, header dot); forgetItemReminders
  (notify.js) + reminder health/test (menu.js reminderHealthHtml,
  Reminders.kt health/test/cancelItem); content-visibility on desks, lite
  mode without card shadows, esbuild --minify in build-site-zip.ps1;
  opt-in usage counts (js/core/stats.js, lib/stats.php, POST /stats,
  GET /admin/stats, panel Visits tab, pref statsOptIn); accessibility
  (render.js labelControls, buttons.css 44px tap areas, --primary-text
  token, #9A4F00 on light Toojibee). Zoom (2.3) skipped by the owner.
- 2026-10-26 — web app — Profile's "Connect to AI" greyed out, last, with
  a "coming soon" badge; FEATURES.aiConnect = true brings it back
  (menu.js, features.js).

- 2026-10-26 — admin panel (panel/panel.html only) — fixes found by
  opening every tab with a local mock of /api/v1/admin (example data,
  not committed): tabs wrap instead of cutting off the last ones; app
  versions showed «ناعدد» (fa() on "1.2.0") — now ver(), Latin digits;
  dates without seconds and kept on one line in the users list; the
  online dot stays beside its label; the visits legend pairs each color
  with its label; server load joined with " / " (a "·" beside Persian
  digits read as another zero); image/cover file fields are Persian
  buttons (.file-pick, filePick()) instead of the browser's English
  "Choose File"; the Hijri calendar shows the solar date beside each
  date field; article form fields aligned (short slug label); user
  handles/emails in detail views isolated (<bdi>); the users tab closes
  a previously opened user.

- 2026-10-26 — admin panel (PHP), Django admin, api.js — mobile and app
  users: each sign-in's device comes from its session's browser string
  (the app's WebView adds "ToojibeeAndroid/<version>"; no schema change).
  Dashboard card "موبایل و اپ": users in the last 30 days from the Android
  app / a phone's browser / a computer, online now with the app, users per
  app version (lib/admin.php tj_admin_device_overview). Users list: device
  column (+ «+ اپ») and a device filter, also for messages to a group
  (lib/admin_users.php TJ_SQL_APP/PHONE, tj_device_of,
  tj_admin_user_devices); user page: last device, app version, each
  device labelled. Visits: APK downloads in 30 days and per version, one
  per person per day (lib/admin_visits.php). Django: api.js deviceMeta
  signs in as platform "android" inside the app; UserAdmin device column
  and DeviceFilter (core/admin.py, test AdminDeviceTests).

- 2026-10-26.6 — web app, Android 1.2.0, Django (one preference) —
  * Smoother: occasions indexed once and kept per day (occasions.js
    occasionsIndex/occDayCache: same 713 results over 3 years, a month
    change ~12 → ~7 ms on a PC); no backdrop blur on any phone or in the
    app (index.html data-lite: Android app, pointer:coarse); the calendar
    drag draws once per frame (calendar-gestures.js attachHomeCalDrag).
  * Widgets (Widgets.kt): the period widget is offered only when the
    account has the period desk (widgetData periodDesk → component
    enabled/disabled; a placed one stays); preview pictures in the widget
    list (res/drawable-nodpi/widget_preview_*.webp from
    deploy/make-widget-previews.js + webp-widgets.py, android:previewImage);
    the calendar widget shows 1, 2 or 4 weeks by its height, the month when
    tall (widgetData weeks, weeksView; arrows move by its weeks); the
    planning widget is drawn like the app's desk (widgetData plan: events,
    tasks pinned-first/done-last, habits; section headings with counts;
    round/square boxes, ✓/✗, struck-through titles, time under the title,
    star; as many rows as fit, "+N" for the rest). Old `desk` data kept
    for APK 1.1.0.
  * Always-there notification (Ongoing.kt, channel "today", low/silent):
    today's date, what's left (tasks · habits · events) and the other
    calendars/occasions; redrawn with the widgets, at midnight and on boot.
    Settings → General "Date in the notifications" (app only; pref
    ongoingNotification, Django PREFERENCE_DEFAULTS ongoing_notification).

- 2026-10-26.5 — web app (so Android too), PHP, Django — 
  * Time picker (js/core/dropdown.js enhanceTime): every minute, hour and
    minute columns loop. A one-time task's "at a time" reminder (input
    data-base/data-span, popup.js reminderSpans) lists hours from now only,
    on past midnight up to 7 days (day labels); a later day is saved as
    notification.date and stretches the task to a range up to that day, so
    it isn't overdue first. notify.js fires it only on that day. Django
    Task.reminder_date (planning 0007 + check constraint + test); PHP keeps
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
