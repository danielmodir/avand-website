# Avand marketing website

## What this is
Static, bilingual (fa/en) landing site for Avand, a time-based personal-development app.
Two primary CTAs: web app and "Download for Android". Project docs are in /docs.
Read the relevant doc before any big change.

## Hard rules
- Plain HTML, CSS and vanilla JS. No frameworks, no npm packages, no build step.
- ZERO external requests at runtime: no CDNs, no Google Fonts, no analytics, no
  third-party scripts. Fonts (Vazirmatn, Inter) must be self-hosted in
  /assets/fonts — never linked from Google Fonts or any CDN.
  Status: the .woff2 files aren't in /assets/fonts yet, so tokens.css's
  @font-face block is commented out and pages fall back to system fonts.
  Uncomment it and drop the files in once they're added; don't add a CDN
  link as a shortcut in the meantime.
- Audience is in Iran on a slow, filtered network. Keep pages light (target: under
  300 KB per page excluding fonts). Prefer SVG or WebP, lazy-load images.
- Every color, spacing and radius comes from CSS variables in /assets/css/tokens.css.
  Never hardcode colors anywhere else.
- Brand is a placeholder (logo "آ" in a circle). Keep it swappable in one place.
- /demo/ holds the HTML prototype. It must have noindex and make no external requests.
  Status: the visible "this is a preview" banner was removed by explicit product decision
  (SPEC.md §11.9) — noindex still applies, and the marketing site (outside /demo/) must
  still never describe it as the finished product.
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
- Primary #3282B8, secondary #0F4C75, dark bg #1B262C, light bg derived from #BBE1FA.
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
