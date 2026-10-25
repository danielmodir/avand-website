# backend/ — Toojibee API (Django + Django REST Framework, MySQL)

One Django app per module, each with **its own MySQL database**
(`config/routers.py`). Not deployed yet; the demo runs without login
until it is (see `frontend/demo/js/services/api.js`).

```
backend/
  manage.py  requirements.txt  .env.example
  config/
    settings/  base.py · dev.py · prod.py · test.py
    routers.py             app -> database
    urls.py                /api/v1/…, /health, admin
  apps/
    common/                UUIDv7 ids, base models, errors, CORS, test helpers
    core/                  accounts, sessions, profile, settings, modules, files, content, admin roles
    calendar_data/         occasions + Iran's official Hijri months (public)
    planning/              categories, tasks/subtasks, per-day ticks, habits, events, sync
    period/                encrypted (envelope encryption, crypto-shredding)
    social/                connections, invites, abuse reports
    notifications/         push devices, quiet hours (inactive until the app exists)
```

## Run locally

Zero setup: no MySQL, no `.env` (SQLite in `local_data/`, development-only
secrets from `config/settings/local.py`, the default for `manage.py`):

```
powershell -ExecutionPolicy Bypass -File backend\start-local.ps1
```

The first run creates `.venv` and installs the requirements; then it
migrates and serves http://127.0.0.1:8000 (`/health`, `/api/v1/…`,
`/admin/`). Admin login: `.venv\Scripts\python.exe manage.py createsuperuser`.
To use it from the demo, set `apiBase: 'http://127.0.0.1:8000/api/v1'` in
`frontend/demo/js/config.js` (don't commit that) and serve the frontend on
port 8080.

Always use the project's Python (`.venv\Scripts\python.exe`); the system
`python` has no Django installed.

Against MySQL instead (as on the server): fill `.env` from `.env.example`,
then `DJANGO_DB_ROLE=migrator python manage.py migrate_all --settings=config.settings.dev`
and `python manage.py runserver --settings=config.settings.dev`.

Tests (no MySQL needed, one SQLite file per module database):

```
python manage.py test apps --settings=config.settings.test
```

## Security model

- **Tokens:** 15-minute JWT access token tied to a session row (checked on
  every request, so logout is immediate) + an opaque 30-day refresh token,
  stored only as SHA-256 and **rotated on every use**. Replaying an
  already-used refresh token signs the user out on every device.
- **Passwords:** Argon2, Django's validators (length, common, numeric,
  similar to email). Failed logins look identical for unknown emails.
- **Rate limits:** login, register, password reset, refresh, search,
  reports and uploads (`REST_FRAMEWORK.DEFAULT_THROTTLE_RATES`).
- **Ownership:** every query filters by the signed-in user; writes to
  someone else's row return 404, never 403 (no existence leaks).
- **Optimistic locking:** writes send the `version` they read; a stale
  version gets `409` with the current row.
- **Uploads:** images only, re-encoded to WebP (strips EXIF/location and
  anything that isn't pixels), 3 MB, served only to their owner.
- **Period data:** AES-256-GCM per-user data key wrapped by a master key
  kept outside MySQL; values bound to table/row/user.
- **Least-privilege database users**, one per module database.
- **Account deletion:** 30-day grace, then a purge across every database.

## API (prefix `/api/v1`)

Errors: `{"error": "<stable_code>", "detail": …}`. Auth: `Authorization: Bearer <access_token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/register` · `auth/login` · `auth/google` · `auth/refresh` · `auth/logout` · `auth/logout-all` · `GET auth/sessions` · `DELETE auth/sessions/<id>` · `POST auth/email/verify` · `auth/email/resend` · `auth/password/forgot` · `auth/password/reset` · `auth/password/change` · `auth/account/deletion` |
| Me | `GET me` (everything for start-up) · `GET/PATCH me/profile` · `GET me/profile/username-available` · `POST/DELETE me/avatar` · `GET/PATCH me/settings` · `GET me/modules` · `PATCH me/modules/<key>` · `POST me/modules/<key>/purge` · `POST me/consents` |
| Files | `POST files` (multipart) · `GET/DELETE files/<id>` |
| Public | `GET content/<key>` · `legal/<privacy\|terms>` · `releases/android/latest` · `calendar/occasions?year=1405` · `calendar/hijri-months?from&to` · `calendar/day?date` |
| Planning | `GET planning/sync[?since]` · `PUT/DELETE planning/<categories\|tasks\|habits\|events>/<id>` · `PUT planning/tasks/<id>/occurrences/<date>` · `PUT planning/habits/<id>/logs/<date>` · `PUT/DELETE planning/<tasks\|events>/<id>/exceptions/<date>` · `PUT/DELETE planning/tasks/<id>/attachments/<file_id>` |
| Period | `GET/PUT period/profile` · `GET period/cycles` · `PUT/DELETE period/cycles/<id>` · `GET period/predictions` |
| Social | `GET social/connections` · `POST …/<user>/request` · `…/<user>/respond` · `DELETE …/<user>` · `PUT/DELETE social/blocks/<user>` · `GET social/search?q` · `GET/POST social/invites` · `DELETE social/invites/<id>` · `POST social/invites/<code>/redeem` · `POST social/reports` |
| Groups | `GET/POST groups` · `POST groups/join` · `PATCH/DELETE groups/<id>` · `POST groups/<id>/leave` · `POST groups/<id>/invite/reset` · `PUT/DELETE groups/<id>/items/<item>` · `PUT groups/<id>/items/<item>/marks` (apps/social/groups.py; the PHP API has the same) |
| Notifications | `POST notifications/subscriptions` · `DELETE …/<id>` · `GET/PUT notifications/preferences` · `PUT/DELETE notifications/mutes/<module>` |

## Admin

`/<ADMIN_URL>` (Django admin). Superusers can do everything; the groups
created after every migrate give partial roles:

- `content_editor`: About text, privacy/terms versions, Android releases, occasions, Hijri months
- `moderator`: abuse reports, look up and suspend accounts

Every admin change is recorded by Django's admin log.

## Scheduled jobs

| Command | When |
|---|---|
| `send_emails` | every minute |
| `purge_accounts` | daily |
| `cleanup_expired` | daily |
| `check_orphans` | weekly (report only; `--delete` to clean) |
| `load_calendar_data` | when a new year's data file is added |

## Deploy (outline)

Gunicorn (`config.wsgi`, `DJANGO_SETTINGS_MODULE=config.settings.prod`)
behind Nginx with HTTPS, Redis for the shared rate-limit cache, the jobs
above in cron or systemd timers, `UPLOAD_DIR` on persistent storage.
