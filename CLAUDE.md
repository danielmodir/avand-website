# Toojibee marketing website

## What this is
Static, bilingual (fa/en) landing site for Toojibee (formerly "Avand", renamed
2026-10-09 at the repo owner's request — see git history/commits for the rename),
a time-based personal-development app.
Two primary CTAs: web app and "Download for Android". Project docs are in /docs.
Read the relevant doc before any big change.

## Hard rules
- Plain HTML, CSS and vanilla JS. No frameworks, no npm packages, no build step.
- ZERO external requests at runtime: no CDNs, no Google Fonts, no analytics, no
  third-party scripts. Fonts (SG Kara for fa, Inter for latin) must be
  self-hosted in /assets/fonts — never linked from Google Fonts or any CDN.
  Status (2026-10-08): both are live via tokens.css's @font-face block.
  SG Kara replaced Vazirmatn at the repo owner's request — it only ships
  one weight (Light), so bold/heading text in fa is browser-synthesized
  faux-bold, not a true bold face; see assets/fonts/sg-kara/NOTE.txt for
  provenance (no formal license file came with it, unlike Inter's OFL one).
- Audience is in Iran on a slow, filtered network. Keep pages light (target: under
  300 KB per page excluding fonts). Prefer SVG or WebP, lazy-load images.
- Every color, spacing and radius comes from CSS variables in /assets/css/tokens.css.
  Never hardcode colors anywhere else.
- Brand is a placeholder (logo "ت" in a circle). Keep it swappable in one place.
- /demo/ holds the HTML prototype. It must have noindex. noindex still applies, and the
  marketing site (outside /demo/) must still never describe it as the finished product.
  The visible "this is a preview" banner was removed by explicit product decision (SPEC.md §11.9).
  Status (conscious exception, 2026-10-06): /demo/ now makes real requests to the project's
  own Supabase backend (demo/cloud.js — plain fetch, no SDK, no CDN) for auth, profile,
  settings, tasks, habits and events, so the prototype is a real, usable, multi-device app
  instead of in-memory fake data. This was a deliberate decision made with the repo owner,
  not a drift — see backend/README.md for why the old /backend/ Express+pg code is now
  superseded by Supabase rather than ever being deployed itself. Store/Period still have
  no backend and stay demo-only fakes. Connections (2026-10-08) is also real now — a
  `connections` table + SECURITY DEFINER RPCs (search_user, send_connection_request,
  respond_connection_request, remove_connection, block_user, unblock_user,
  list_connections); the client never writes the table directly. This exception is
  /demo/-only: the marketing site (index.html, /en/, /fa/) still makes zero external
  requests, full stop.
- Domains: .ir is canonical; .com redirects to it (settled during deployment).

## Product claims
- The marketing site (index.html, /en/, /fa/ — everything outside /demo/) only
  advertises MVP features: Task, Habit, Event, Calendar, reminders (see
  docs/avand_phase2_v1.md and docs/avand_mvp-scope-amendments_v1.md). Do NOT
  advertise Reports/Charts, AI, Challenge, Journal, Tool Store or Social there.
- /demo/ itself is an exception by explicit, conscious decision (SPEC.md §11.9):
  it now also includes Social (Friends/Connections) and a Tool Store-style
  Feature Center, deliberately going beyond the docs' original MVP scope for
  demo/prototyping purposes. That expansion is /demo/-only — it does not change
  what the marketing site is allowed to claim.
- Do not name competitors in copy. Do not invent numbers, testimonials or user counts.
- If something is not in /docs, ask me instead of guessing.

## Design system (docs/avand_phase4-designsystem_v1.md)
- Status (2026-10-09): palette replaced at the repo owner's request with
  https://coolors.co/palette/000000-14213d-fca311-e5e5e5-ffffff — primary
  #FCA311 (orange), secondary #14213D (navy), dark bg #000000, light bg
  derived from #E5E5E5. The docs/avand_phase4-designsystem_v1.md file still
  describes the original blue palette; tokens.css is the source of truth.
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
