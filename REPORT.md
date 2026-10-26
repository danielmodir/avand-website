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
