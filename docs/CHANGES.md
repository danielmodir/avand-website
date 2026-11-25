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
| Next-version management | docs/next-version/ | audit, 113-row master checklist, implementation plan, decisions, test report and API/data inventory; phased development approved by owner |

Checklist per feature: UI (fa + en strings in js/core/i18n.js, both themes,
360/1280 px) → PHP endpoint + migration → Django model + migration + test →
both API clients → offline behavior (no apiBase) → Android if it needs native
code → bump demo asset version (`?v=` in frontend/demo/index.html) → commit,
push to a review branch. Deployment is a separate step requiring the owner's
explicit instruction after review (owner, 2026-11-15). Do not push to master
during review: pages.yml automatically publishes GitHub Pages on that branch.
Packaging, when authorized: deploy/build-site-zip.ps1; Android: deploy/build-android.ps1.

## Code map

- Web app core (frontend/demo/js/core/): state.js (app state), render.js,
  events.js, i18n.js (all strings), dates.js / calendars.js (Jalali, Hijri,
  Gregorian), occasions.js (calendar rules and reminder plans), groups.js, trackers.js (habit counter/timer),
  habit-goals.js (period goals, calendar periods and streaks),
  notify.js (reminders/push), android.js (bridge to Kotlin), local-store.js,
  search.js, include.js (loads component partials), compat.js (old WebViews).
- App themes: frontend/demo/js/core/themes.js (6 palettes × 2 appearances,
  semantic tokens and pre-paint storage); css/themes.css (states/selector);
  docs/theme-system/ (color audit and verification); tests/themes.test.js and
  tests/theme-ui.cjs. Old palette CSS and accent picker removed.
- Web app components: app-error, articles, auth, banner, birthday, calendar,
  contact, date-picker, day-sheet, groups, items, menu, notices, period,
  popup, toolbar, tour, workspace. The workspace now includes a separate
  Habit Tracker pane, still using the existing habit rows and records.
- PHP lib: auth, sync (the user's synced document), google_calendar (separate
  Calendar grant and later event sync), google_calendar_event (safe event
  projection), google_calendar_diff (pure three-way comparison),
  google_calendar_plan (read-only collection merge), google_calendar_remote
  (Google API transport and paginated primary-calendar read), social, groups, push,
  notices, calendar, dates, content, articles, page (SEO page builder), mail,
  support, admin*, bootstrap (config, DB, schema).
- Django apps: core, calendar_data, planning, period, social,
  notifications, finance (+ common; finance currently has a private ledger
  foundation only).
- Android Kotlin: MainActivity, AppWeb, WebFiles (offline/OTA files),
  Reminders, PhoneActions, Widgets.
- Deploy scripts (deploy/): build-site-zip.ps1, build-android.ps1,
  make-keystore.ps1, make-logo.js, render-logo.js, make-desk-shots.js,
  webp.js, make-quotes.py, webp.py, css-compat.js.
- Next-version work: docs/next-version/README.md links the audit, central
  checklist, dependencies, decisions, baseline tests and source-derived
  API/model inventory. This is the management source for the new update.

## Current versions

Update these with every change.

- Demo asset version: 2026-11-22.6
- Logo cache version: tj7 (transparent mark, site and six app palettes)
- PHP schema: v30
- Django latest migrations: core 0012, planning 0012, social 0005,
  notifications 0003, calendar_data 0002, period 0001, finance 0001
- Marketing CSS cache version: 2026-11-23.1
- Android source: 1.4.1 (versionCode 6; APK not built or published)

## Log (newest first)

- 2026-11-25 — Google Calendar read-only preview — PHP now reads all pages of
  the signed-in user's primary Google calendar, bounds the snapshot at 10,000
  events, and returns a merge plan against the user's local `/sync` document
  and stored event links. Schema v30 holds the last agreed event projection
  for later conflict-safe apply. The preview makes no event writes; apply,
  conflict UI, Google Cloud credentials and deployment remain pending.

- 2026-11-25 — Google Calendar collection planning — a read-only PHP
  merge plan now matches known event links, reconnects by stable private
  ID, pairs only unique exact matches, and proposes imports/exports for
  new events. Unsupported local/Google events remain on their original
  side; a mapped unsupported event is never mistaken for deletion.
  Applying the plan, persistence and live Google requests remain pending.

- 2026-11-25 — Google Calendar recurrence projection — the mapper now
  round-trips bounded daily, weekday, Gregorian monthly and Gregorian
  yearly rules. Solar Hijri/Hijri and complex Google rules (count/until,
  exceptions or rules without an exact app equivalent) remain untouched
  on their original side. PHP CI covers all supported modes; API writes
  and live consent remain pending.

- 2026-11-25 — Google Calendar event projection — added a pure PHP mapper
  for ordinary single events and date ranges. It preserves all-day
  exclusive ends, Iran-time timed events, optional end time, location and
  meeting link; imported Google times are converted from their offsets.
  At that step, recurrence and special Google event types were rejected
  explicitly, not flattened. PHP CI run 45655943181 passed round trips;
  actual API writes remain pending.

- 2026-11-25 — Google Calendar conflict planning — added a pure three-way
  comparison of last-synced, local and Google event snapshots. One-sided
  edits can be proposed for transfer; one-sided deletes and concurrent
  divergent edits are held for user confirmation. No calendar writes occur
  in this step. Owner chose automatic initial merging, while unsupported
  Solar Hijri/Hijri recurrence stays only in Toojibee. PHP CI run
  45655120314 passed the conflict matrix; live integration remains pending.

- 2026-11-25 — PHP Google Calendar grant foundation — added separate
  account-bound consent with a one-use state, PKCE, the narrow owned-events
  scope and encrypted refresh-token storage (schema v29). Status, connect,
  callback and disconnect routes are present. No events are read or written
  yet, and no Google Cloud client or live callback is configured. The PHP
  workflow run 45553647948 passed PHP lint and grant/migration tests;
  live verification is pending.

- 2026-11-25 — Google Calendar sync preparation — owner narrowed the
  integration to two-way event sync with the primary Google calendar and
  manual approval for unilateral deletion or simultaneous edits/deletes.
  Added a branch-only PHP lint/test workflow so the live PHP target can be
  checked while local PHP CLI is unavailable. No OAuth credentials, API
  schema, frontend behavior or deployment changed in this step.

- 2026-11-25 — PHP API release preparation — allowed CORS only for the
  GitHub Pages browser origin, including JSON/bearer preflight; denied
  other origins and kept cross-origin cookies disabled. The live API health
  endpoint returned 200 before this patch, but its Pages-origin request had
  no Allow-Origin header and OPTIONS returned 405. Host upload, live
  preflight verification and switching the Pages app to the API remain
  pending. Owner selected GitHub Pages for the site and toojibee.ir for the
  PHP API, with final publication after service-backed features are ready.
  docs/DEPLOY.md now records the API-first checks and Pages switch order.
  No frontend release or database change.

- 2026-11-23 — review and release preparation — reconciled accumulated
  web, API, Android-source and documentation changes for team review. Added
  core 0012 for the previously unrecorded EmailOutbox template choice,
  refreshed the marketing CSS cache version and corrected doubled logo URL
  separators. Local checks: Node 64/64, Django 103/103, browser 12/12
  marketing/app cases and 48/48 theme cases without page errors, external
  requests or overflow; release ZIP built (255 files). GitHub Pages serves
  frontend only; the PHP and Django APIs and a new APK are not deployed by
  that workflow. PHP CLI, live OAuth and Android device checks remain open.
  Review source pushed to `codex/phase2-development-2026-11-22`; GitHub
  Pages workflow run 45069902360 published commit `ff1de50` at
  https://danielmodir.github.io/avand-website/ . The live site passed the
  same 12-case browser smoke check. `master` remains unchanged.

- 2026-11-22 — Django finance foundation — a separate `finance` database,
  owner-scoped account/card/category/transaction/ledger-entry tables, initial
  migration, integer-toman atomic posting service and user purge handler.
  An idempotent request key and owner validation prevent duplicate posting
  and cross-user account use. Transfers produce two opposite entries, so
  wallet total remains unchanged. Five finance domain tests and the full
  Django suite (103/103) pass; Node 64/64 and finance migration check pass. The PHP
  schema/API, web and Android desks, encrypted offline queue, SMS path and
  university package are still unimplemented. No deploy or release.

- 2026-11-22 — docs — the owner selected Toman as the financial base unit,
  per-dossier GPA rules and direct APK distribution, and approved the
  additive financial ledger design plus encrypted offline storage.
  `docs/phase2/IMPLEMENTATION_DESIGN.md` records the proposed contracts,
  SMS permission constraints and academic data links. No finance or
  university runtime code, schema or deployment in this entry.

- 2026-11-22 — web app and Django planning — phase-two Habit Tracker work.
  Planning and its progress card now omit habits; a separate pane reuses
  the existing records, daily controls and details. Period goals (daily,
  weekly, monthly), streak and success-rate calculations, and a selectable
  daily/weekly/monthly progress calendar are added without rewriting
  completion history. Django planning 0012 stores optional goal JSON;
  the Django client maps it, PHP sync already retains additive habit JSON,
  and offline storage retains the same object. Asset version 2026-11-22.6.
  Node 64/64, Django 98/98 and browser 360/1280 × fa/en × light/dark pass;
  no external browser requests or horizontal overflow. Core EmailOutbox
  migration drift predates this change; PHP CLI, Android device and live
  backend not tested. Financial and university desks remain open. No deploy.

- 2026-11-22 — web app, PHP event document, Django planning — events now
  keep an optional manual location and an http(s) meeting link. Both appear
  in the existing event editor and details popup; the same event record is
  used in both desks. The PHP sync document retains the additive fields.
  Django planning 0011 adds two fields and the Django client maps them.
  Asset version 2026-11-22.3. Node 53/53, Django 96/96, planning migration
  check and eight browser cases passed; no external browser requests. Map
  search/coordinates and a live API/Android check remain open. No deployment.

- 2026-11-22 — Django planning — event meeting links now reject non-web
  schemes such as ftp, matching the editor's http(s) rule. The focused API
  tests pass 2/2, including both invalid schemes. No schema change.

- 2026-11-22 — web app and PHP API — connected the existing one-use Google
  OAuth flow to the live PHP router and client. Provider availability comes
  from server configuration; the PHP client reuses the Django client's
  verifier and redirect handling. Additive PHP schema v28 creates the
  Google subject mapping without changing existing accounts. Demo asset
  version 2026-11-22.2. Node 53/53, focused client 1/1; PHP CLI, provider
  credentials, live redirect and Android handoff remain unverified. No deploy.

- 2026-11-18 — web app, PHP document settings, Django settings/calendar API —
  optional per-occasion reminders now use the existing browser, push and
  Android notification schedules. Each plan selects a time and 0–56 days
  before, with multiple editable, toggleable reminders; none are on by
  default. Stable calendar-rule keys survive a changed Gregorian date for
  an official Hijri month. PHP sync retains the settings object; Django
  validates it in existing JSON preferences and exposes rule month/day,
  so no schema migration is needed. Asset version 2026-11-18.2. Node 51/51,
  Django 94/94, browser 8/8 matrix and add/toggle/delete pass; no external
  browser requests. Category/country templates, live delivery and a real
  Android device remain open, so NV-03-04 is In Progress. No deployment.

- 2026-11-18 — Django API web client — Google sign-in now sends a
  per-tab SHA-256 challenge and exchanges the redirect code with its
  one-time verifier. The browser clears the verifier on callback and shows
  an existing localized error if crypto or storage is unavailable. No
  server, schema, PHP or Android native change. Demo asset version
  2026-11-18.1. Focused Node 2/2 and full Node 48/48 pass. Live Google
  credentials and redirect on a deployed host remain unverified. No deployment.

- 2026-11-17 — web app, Django planning, PHP document compatibility —
  one event now has independent default-on visibility in Planning and
  Occasions (same record, reminder and recurrence). The existing event form
  has two choices; Django planning 0010 adds boolean fields and the Django
  client maps them. PHP sync already retains additive event JSON, so no PHP
  schema change. Demo asset version 2026-11-17.2. Node 46/46, Django
  91/91, and eight browser cases pass; no external requests in the browser
  run. The current worktree has a separate Google redirect test correction;
  the web client's Google flow still needs a fix. Core EmailOutbox migration
  drift, PHP CLI, actual Android
  WebView and live database remain unverified. No deployment.

- 2026-11-17 — web app — date picker now rejects an end time without a
  start time while preserving same-day order and overnight ranges. Added
  focused Node regressions (3/3). Demo asset version 2026-11-17.1.
  No backend or schema change; live deployment and device checks pending.

- 2026-11-16 — web app, PHP validation, Django planning — custom reminder
  windows for one task/habit/event (owner decision): minute/hour interval,
  aligned end inclusive, overnight occurrence identity, DST gap handling,
  activation cutoff at activity save, editing/removal without duplicating
  activities. Legacy hourly reminders unchanged. PHP JSON needs no migration;
  Django planning 0009 adds nullable reminder_window_end and constraints.
  Verification: Node 40/40, related Django 24/24; source and bundled
  reminder UI 8/8 each (360/1280, fa/en, light/dark), no external requests.
  Details and remaining native timezone/400-slot queue limits:
  docs/next-version/REMINDER_WINDOWS.md. PHP CLI and actual phone unavailable;
  no live DB migration or deployment. Feature remains In Progress.

- 2026-11-16 — web app packaging — central spacing/radius tokens are
  loaded explicitly in the source page and embedded in the release CSS,
  fixing an ignored component @import after concatenation. Preserve early
  head scripts separately from DOM-dependent body JS and include them in
  Android offline hashes. Local ZIP build succeeds; bundled app boots and
  timeline padding/radius pass 8 viewport/language/theme browser cases,
  with no page errors or external requests. No publication or APK build.

- 2026-11-16 — web app, Django preferences — selectable weekend days in
  Calendar settings (seven boolean preferences, existing storage/API mapping).
  Month, week, expanded calendar and date picker use red text, double underline
  and accessible labels. Week start and scheduling unchanged; default empty
  selection preserves prior behavior. No schema migration. Node 2/2, Django
  API 2/2 and eight browser matrix cases including reload persistence pass.
  Native Android widgets retain existing behavior pending native integration.

- 2026-11-16 — marketing site, web app, Android assets — removed the circular
  field around the owner's new logo. The vector generator now writes a
  transparent mark for site icons plus separate splash/banner colors for all
  twelve app appearances; favicon, PWA and Android launcher images were
  regenerated. Marketing headers switch transparent marks with light/dark,
  app logo URLs use tj7, and the app asset version is 2026-11-16.6. The
  circular loader rings were removed; 28 baked marketing screenshots were
  recaptured from the current app. The Android OTA manifest lists both sets
  of app marks. Native source version remains 1.4.1 (6). Preview source was
  pushed to `codex/logo-preview-2026-11-16` on GitHub and a public,
  noindex test copy published at
  https://toojibee-logo-review-20261116.outermodel4.chatgpt.site.
  The production domain and `master` were not changed.

- 2026-11-16 — web app — ordinary events can be created/edited in the past
  (popup.js, events.js); tasks retain their prior rule. The picker retains
  older stored dates. Existing PHP document sync and Django Event API already
  support past dates; no schema/API change. Five Node regressions, two Django
  API tests and eight browser cases pass, including no stale event reminders.
  Custom interval = one activity with multiple reminders (owner); occasion
  notifications require the user to choose their time (owner). No deployment.

- 2026-11-16 — web app, Android WebView, Django settings — replaced old
  Toojibee/Classic/accent/period skins with six owner-specified palettes and
  twelve light/dark schemes (themes.js, themes.css). Independent System
  appearance, synchronous pre-paint migration/storage, Android bars, localized
  dual-preview settings cards and accessible semantic states. Shared sizing
  tokens remain in assets/css/tokens.css. Django palette IDs expanded/migrated
  (core 0011_six_theme_palettes); API client saves System; PHP settings already
  accept the document. Five color/state tests and seven targeted Django settings tests pass.
  Full Node suite passed 28 tests before a concurrent historical-event test
  was added; latest run 28/29 (new test VM lacks navigator; unrelated). Chromium: 48 selector combinations
  (12 × fa/en × 360/1280), System/reload/toolbar behavior, twelve dialog/day-sheet
  states; no page errors or external requests. See docs/theme-system/README.md
  and token-audit.json. Broader core Django tests retain an unrelated Google
  redirect test failure. Android physical-device check and production
  deployment not performed. Asset version 2026-11-16.4; existing concurrent
  work preserved and changes left uncommitted for review.

- 2026-11-16 — web app (Android WebView too) — main desk/day calendar/day
  sheet share an hourly task + event timeline (items.js/css, i18n.js). Explicit
  start times sort chronologically; untimed pin/done/collapse behavior and
  habits retained. No API/DB/native widget change. Five timeline Node tests,
  including 10,000 items; browser 360/1280 × fa/en × light/dark, completion,
  shared status, event details/deletion; no external requests. Owner approved
  phased work; no host deployment. Unrelated working changes excluded.

Format: `date — surfaces — what changed (key files)`.

- 2026-11-16 — marketing site, web app, Android assets — replaced the old
  Tj-road drawing with the owner's new flat, shadow-free mark from the supplied
  image. `deploy/make-logo.js` generates the site SVGs and twelve app badges
  from the current six light/dark palette tokens; `deploy/render-logo.js`
  renders PNG, ICO, social preview and launcher files. The app banner and
  splash follow the selected palette, including Android offline file updates
  (`themes.js`, `include.js`, `build-site-zip.ps1`). All icon URLs use tj6;
  demo asset version is 2026-11-16.2. The 28 marketing screenshots containing
  the old mark were recaptured (`make-desk-shots.js`) and encoded with the
  package-free `deploy/webp.js`. Android monochrome notification mark
  updated; Android source version is 1.4.1 (6), pending a new APK build.
  No API or database change.

- 2026-11-16 — repository instructions — synchronized `AGENTS.md` with the
  full contents of `CLAUDE.md`, so Codex and Claude Code follow the same
  project rules. No runtime or version change.

- 2026-11-15 — docs only — next-version initial audit and management system
  (docs/next-version/): 111 traceable rows, 15-section product mapping,
  PHP/Django/API/database/Android inventory, dependency plan, 22 open product
  decisions and evidence-backed risks. Baseline: 14 Node tests and 76 Django
  tests pass; migration drift check passes. Core migration number corrected
  to the existing 0009_mcp_key; no new migration or runtime version change.
  No feature implementation or host deployment. Development requires owner
  coordination; local changes go to a GitHub review branch first, and the
  production host remains untouched until an explicit later instruction.

- 2026-10-27 — web app, Django — prayer times off by default (owner): pref
  prayerShow false (util.js DEFAULT_PREFS, Django prayer_show False); turned
  on in Settings of the Occasions desk. The «به روش مؤسسه‌ی ژئوفیزیک…» note under
  the prayer settings removed too (owner).

- 2026-10-27 — web app — the «این روز رو بفرست» (text) button removed from the
  Occasions desk at the owner's request; the picture card «عکس این روز» stays
  (workspace.js renderOccasionsPane; shareDay() kept, unused).

- 2026-10-27 — PHP API, admin panel — Users tab switch «ثبت‌نام بدون کد تأیید ایمیل»
  (owner's request): lib/auth.php tj_auth_settings() reads
  data/auth-settings.json; on = register returns a session at once (email
  marked verified) and login confirms an unverified account after a correct
  password. GET/PUT /admin/auth-settings (users.view / users.manage, audit
  log). The app already handled tokens from register (auth.js). Django: not
  done (not deployed; still always sends the code).

- 2026-10-27 — web app (Android) — «تنظیمات عمومی» didn't open in the app: the
  page read Notification.permission, and the WebView has no Notification
  object (notifySupported() is true there because of the bridge). New
  notifyPermission() in notify.js (bridge first, then a real Notification),
  used by menu.js and popup.js (the reminder hint was wrong in the app too).

- 2026-10-27 — the owner's earlier list (web app, Django) — event icons (cake for
  birthdays / «تولد», book for «کلاس»; cake on the day: birthday.js
  eventIconHtml, birthdayMarkHtml); event card menu on long press / right
  click (edit, share a copy, delete with confirm) instead of the trash button
  (items.js openEventMenu); a colour per event (form eventColorRow, eventColor
  checked #RRGGBB; Settings colours now tasks + habits only; Django Event.color
  0008); share a copy link #add=… for any item (items.js shareItemLink /
  takeItemFromLink, data in the link); main desk (pref mainDesk, deskKeys puts
  it first); group tour no longer half off screen (tour.js: vertical scroll
  inside desks only, waits for the slide); duplicate task names: confirm, then
  #2, #3.

- 2026-10-27 — Phase 3.12 + wrap-up — accent colours unlocked by friends
  (css/palette-accents.css, util.js ACCENTS/currentAccent, Settings > General
  accentRowHtml, pref accent). 3.11 already done (33 articles live). Android
  1.4.0 (5): prayer line on the date widget, saveFile, shareImage +
  ShareFiles provider. Tests: node --test tests/*.test.js (14) + Django.

- 2026-10-27 — Phase 3.9–3.10 (web app) — quick start (js/core/onboarding.js):
  3 steps (picks → first item → widget/install), skippable, resumable
  (localStorage toojibee-onboard-v1), replaces the auto general tour; part
  tours no longer auto-start (maybeFeatureTour returns), all still in Profile
  → Tutorials (+ a Quick start row). PWA: sw.js offline shell (network first,
  copy when offline; never /api/, other sites or inside the Android app),
  registered at boot on https (app.js); install offer only after something
  was made (maybeOfferInstall), 'not now' remembered. Next: 3.11 articles.

- 2026-10-27 — Phase 3.8 (web app, Django client) — Profile → Ready-made
  plans (menu sub 'templates', js/core/templates.js): weekly study plan,
  Ramadan (official Hijri table), 30-day challenge, added as ordinary items;
  focus timer 25/5. Habits may have endDate (habitOccursOnDate; api.js maps
  end_date; kept on edit). Exam countdown = 3.3 presets. Next: 3.9 onboarding.

- 2026-10-27 — Phase 3.7 (web app) — friendly challenges: a group habit's
  data.challenge {days 7|21|30, start} (js/core/challenge.js; no backend
  change, group item data is free JSON). Form field in groupFieldHtml;
  habitOccursOnDate stops after challengeEnd; details (groupDoneHtml) show
  each member's progress, a nudge (share sheet text) and at the end a share
  card (kind 'challenge'). Next: 3.8 student pack.

- 2026-10-27 — Phase 3.6 (web app, Android) — share cards: js/core/share-card.js
  (canvas 1080px in the current palette/theme: habit streak, countdown/
  birthday, the day + occasions, my day summary). Buttons: item details
  (habit, event with kind), Occasions desk, Profile. Android: bridge
  shareImage(name, base64) + ShareFiles.kt content provider (no library,
  cacheDir/share, read-only grant), APK 1.4+; else Web Share files or .png.
  Next: 3.7 challenges.

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
  Django planning 0008_event_kind. Next: 3.4 date tools.

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
    Task.reminder_date (planning 0008 + check constraint + test); PHP keeps
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
