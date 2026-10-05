# Avand backend (superseded by Supabase — not deployed)

A real Express + PostgreSQL API matching the data the `/demo/` prototype
used to fake client-side (tasks, habits, events, profile, settings, auth).
**This is not connected to the live site and not deployed anywhere.**
GitHub Pages (where `avand-website` is hosted) only serves static files —
it cannot run Node.js or a database, so running this would need a separate
Node host (Render/Railway/Fly.io/a VPS), which means creating an account
somewhere new. See `SPEC.md §11.8` in the repo root for the full context
on that original decision.

As of 2026-10-06, `/demo/` is wired to a real backend anyway — just not
this one. It talks directly to the project's existing Supabase project
(Postgres + Auth, via plain `fetch()` in `demo/cloud.js`, no SDK) instead,
since that didn't require provisioning anything new. This Express API is
kept here for reference/review but won't be deployed; the schema below
and `src/db/schema.sql` describe the same data shape, just normalized
differently (this uses join tables for subtasks/photos/sessions, while
the live Supabase schema uses `jsonb` columns since the UI always
reads/writes those as whole objects anyway).

## Running it locally

1. Have a real PostgreSQL server reachable (local install, Docker, or a
   free-tier hosted instance — this repo doesn't provide one).
2. `cp .env.example .env` and fill in `DATABASE_URL` (and a real
   `JWT_SECRET` — don't ship the placeholder).
3. `npm install`
4. `npm run migrate` — applies `src/db/schema.sql` to that database.
5. `npm start` — listens on `PORT` (default 4000).
6. `curl http://localhost:4000/health` should return `{"ok":true}`.

## What's here

- `src/db/schema.sql` — the full schema (tables, enums, indexes, a couple
  of `updated_at` triggers). Heavily commented with *why*, not just *what*.
- `src/routes/` — one file per resource (`auth`, `profile`, `settings`,
  `tasks`, `habits`, `events`), each a thin Express router.
- `src/middleware/auth.js` — verifies a bearer JWT against the `sessions`
  table (so logout / revocation actually works, unlike a stateless-only
  JWT setup).

## What's deliberately NOT here

- No file/photo upload storage (task photos, profile avatar) — routes
  accept a `url` you already have (e.g. from S3/Cloudinary/whatever you'd
  pick later); this API doesn't handle the upload itself.
- No recurrence expansion (which dates a recurring task/habit/event
  "occurs on") — that logic already exists client-side in `demo/index.html`
  (`occursOnDate`/`habitOccursOnDate`) and is cheap enough to keep doing
  there against whatever date range is on screen, rather than duplicating
  it server-side.
- No rate limiting, email verification, or password reset flow — add
  these before this ever handles real user data, not before.

## If you do want this actually running somewhere

You'd need, at minimum:
1. A host that runs Node.js processes (Render, Railway, Fly.io, a VPS —
   not GitHub Pages).
2. A real PostgreSQL instance (most of the above offer one, or use a
   managed provider like Neon/Supabase).
3. To decide how the static frontend calls it — which means the frontend
   stops being a zero-external-request static site (see `CLAUDE.md`'s
   hard rules) for at least the pages that need real data. That's a real
   architecture change, not just a deploy step, so it's worth deciding
   deliberately rather than backing into it.
