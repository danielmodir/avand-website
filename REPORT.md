# Growth spec — developer report

Work log for the acquisition/retention spec (phases 1–3). One commit per task;
the user-facing summary is in CHANGELOG.md, the code map in docs/CHANGES.md.

## Phase 1 — Blockers for growth (2026-10-26)

| # | Task | Result | Commit |
|---|------|--------|--------|
| 1.1 | Sharing | **[VERIFY] claim wrong**: sharing already worked (Web Share API in the browser, `ToojibeeAndroid.share` bridge in the app, clipboard fallback) for the invite link, group link and "share the app". The "not available in this prototype" string was unused. Added: **share this day** (date in every calendar + the day's occasions + site link) on the Occasions desk, also for guests. Removed the dead string. | 54e9f4e |
| 1.2 | Deep links | Invite (`/demo/#invite=`) and group (`/demo/#group=`) links already live under `/demo/`, which the intent filter handles, and the app's own page is served at `https://toojibee.ir/demo/`. Added `android:autoVerify="true"` and `/.well-known/assetlinks.json` with the **real** release-key SHA-256 (read with `apksigner` from the signed 1.2.0 APK, no placeholder). Takes effect with the next APK (1.3.0). On the web the links open the web app as before. | 9ddba65 |
| 1.3 | Google sign-in | **[VERIFY] claim partly wrong**: no dead button is shown. The button only appears when the server says Google is enabled (`/auth/providers`), and the live PHP backend answers `google:false`. The "unavailable" string is only an error message. Nothing changed; backend need listed below. | — |
| 1.4 | Signup friction | Guest mode unchanged. Added: password rules ticked off while typing (same rules, not weaker), show/hide password button. Already there: correct input types, autocomplete, autofocus, 6-digit email code with a 60 s resend countdown. | b6b2d8e |
| 1.5 | Discoverability | **[VERIFY] claim partly wrong**: `/demo/` is noindex (correct, it's the client-side app) and an indexable landing already exists at `/`, `/fa/`, `/en/` with title/description, OG/Twitter tags, JSON-LD, sitemap.xml, robots.txt (allows everything except `/api/`), server-rendered articles. Added a `MobileApplication` (Android) entry to the landing JSON-LD. | b992f4b |
| 1.6 | Descriptor "تقویم و برنامه‌ریز" | Under the name on the app's start screen, the About page and every site page's header. `docs/store-listing.md`: short + long Persian text for Cafe Bazaar / Myket. The Android launcher label stays "توجیبی" (Android has no label subtitle; the store name carries the descriptor). In the app the start screen is now a still logo + name (no second, spinning loader after the native splash). | cce0bf8 |
| 1.7 | Beta/prototype wording | **[VERIFY] correct.** About now shows the real version (app: from the APK's user agent; web: the files' version). "…in this prototype" → "…not available yet" (and its only entry point is hidden in 1.8). | 9c073d4 |
| 1.8 | Feature flags | `frontend/demo/js/core/features.js`: `FEATURES` + `featureOn()`. Hidden: Store (all locked/upgrade cards, including the AI and analytics cards); Articles without a backend that serves them; Messages when there are none. The "Hijri coming soon" message was already unused (the Hijri layer works) and was removed. | 0b2e135 |

Also in this phase, at the owner's separate request: the landing hero glow goes edge to edge and page text sits 32 px from the sides on phones (d26d8c6).

### Backend work still needed
- **Google sign-in on the live (PHP) backend.** The Django backend has it (`/auth/google/*`), the PHP one doesn't (`/auth/providers` → `google:false`). Needs a Google OAuth client, a redirect flow in `backend-php/lib/auth.php`, and linking accounts by verified email.

### Decisions for the owner
- **Feature flags** (`js/core/features.js`): the store stays hidden until it has something real; flip `store: true` to bring it back.
- **Store listing text** (`docs/store-listing.md`): review before publishing; it mentions the period desk ("optional"). Remove that line if you'd rather not advertise it in stores.

### Known risks
- App links verify only after **1.3.0** is installed (the manifest change) and `assetlinks.json` is live; until then Android may still ask which app opens a link.
- If the release key changes, `assetlinks.json` must be updated with the new SHA-256.

## Phase 2 — Trust, privacy, quality (2026-10-27) → app 1.3.0 (versionCode 4)

| # | Task | Result | Commit |
|---|------|--------|--------|
| 2.1 | Backups | **[VERIFY] correct**: `allowBackup` was `true`. Now `false`, with `backup_rules.xml` / `data_extraction_rules.xml` that exclude every domain (cloud backup and device-to-device). | 333bd24 |
| 2.2 | WebView hardening | Mixed content never, no file-URL access, no geolocation, no saved form data. The JS bridge answers only the app's own page (`AppWeb.trustedPage`, updated on page start / history / finish); every argument is size-capped or checked (text, JSON ≤ 2 MB, language, kind, colour); bad widget JSON is ignored. | b1fa589 |
| 2.3 | Zoom | **Skipped at the owner's request.** | — |
| 2.4 | Period privacy | **[VERIFY]**: period data was synced to the server (encrypted at rest). Added in Period settings → Privacy: *keep on this phone only* (off by default; on = local copy, server copy purged, shares stopped), *discreet notifications* (neutral title/text), *app lock* with the phone's own PIN/fingerprint screen (APK 1.3+; asks on open and after a minute away), *export* (JSON file) and *delete all*. Privacy pages fa/en got a period section (`#period`). | 74d7c04, b1fa589 |
| 2.5 | Invite approval | **[VERIFY] correct**: an invite link made you friends at once. New setting on the Friends page, *approve invite requests* (off by default): when on, opening the link sends a request instead. PHP + Django + a Django test. | 316972d |
| 2.6 | Offline / sync state | The full-width strip became a small dot by the header: red = offline, amber = changes waiting to sync; hidden when all is well; tap explains. | 0218a08 |
| 2.7 | Reminders | Deleting a task/habit/event removes its reminders at once (phone alarms, service-worker notifications, push resync). App: *reminder health* row in General settings (exact alarms, battery optimisation, notifications allowed) with fix buttons and *send a test reminder* (arrives in a minute through the real alarm path). | 8d62215, b1fa589 |
| 2.8 | Smoothness | Desks off screen aren't laid out (`content-visibility:auto`); lite mode (phones, the app) drops big card shadows; the build now minifies JS/CSS (bundle.js 545 → 524 KB, gzip 138 → 135). Month switch ~11 ms, home render ~5 ms on a 375 px viewport. | 8d15349 |
| 2.9 | Usage counts | Opt-in only (*Help improve Toojibee*, off by default). Sends just an event name to our own server — no account, device id, content or anything about the period. Events: onboarding_done, first_task, first_habit, return_d1/d7/d30, share, invite_accepted. Daily counts in one JSON file (30 days); the admin panel's Visits tab shows totals. | 45c6f04, 7126174 |
| 2.10 | Accessibility | Every switch and back arrow has a role, state, name and keyboard access; overlays hidden from screen readers; 44 px tap areas on small buttons/switches/dots (look unchanged); orange text on the light Toojibee theme darkened to 5.4:1 (`--primary-text`, was 2.5:1). | 457a9fd |

Also at the owner's request: "Connect to AI" in Profile greyed out, last in the list, with a "coming soon" badge (a70a11a).

### Backend work still needed
- **Usage counts on Django**: only the PHP backend has `POST /stats` (Django accepts the `stats_opt_in` preference but has no endpoint yet).
- Google sign-in on PHP (from Phase 1) is still open.

### Decisions for the owner
- Defaults chosen as *off*: invite approval, usage counts, period local-only. Say if any should start *on*.
- `FEATURES.periodMinAge` is 0 (no age gate on the period desk). Set an age if you want one.

### Known risks
- With *keep on this phone only*, period data lives only on that device: a lost phone or cleared app data loses it (the setting says so; export is next to it).
- App lock needs a screen lock on the phone; without one the switch explains and stays off.
- Usage counts are per IP-throttled (60/h) but anonymous, so numbers are estimates, not unique users.
