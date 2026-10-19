# backend-php — accounts and sync on the live (shared cPanel) host

The live host runs PHP + MySQL but not Python, so the full Django API
(`backend/`) can't run there. This is a small PHP API at
`https://toojibee.ir/api/v1/` that gives the app real accounts and keeps
each account's data on the server. The app picks it automatically on
the live domain (`frontend/demo/js/config.js` → `backend: 'php'`,
client: `frontend/demo/js/services/api-php.js`).

## Endpoints
| Method | Path | |
|---|---|---|
| GET | /health | DB reachable |
| GET | /auth/providers | `{password:true, google:false}` |
| POST | /auth/register | all required: email, password (8+, a letter and a digit/symbol), username (`a-z 0-9 _ .`, 3-30, unique), gender (`female`/`male`), birth_date (at least 9 years ago) → tokens; sends a verify email |
| POST | /auth/login | → tokens |
| POST | /auth/refresh | rotates the refresh token |
| POST | /auth/logout | |
| POST | /auth/password/forgot | always 200; mails a 1-hour reset link if the address exists |
| POST | /auth/password/reset | token, password → signs every device out |
| POST | /auth/email/verify | token |
| GET / PATCH | /me | profile basics |
| POST | /me/delete | password → deletes the account and its data |
| GET / PUT | /sync | the account's document `{version, data}`; PUT with a stale version → 409 + current copy |

Errors are `{"error": code}` with the same codes as the Django API
(`invalid_credentials`, `email_taken`, `weak_password`, `throttled`,
`invalid_or_expired_token`, …), so the app's messages work unchanged.

## Security
- Passwords: `password_hash()` (bcrypt). Tokens: 256-bit random, only
  their SHA-256 stored; access 1 h, refresh 60 days, rotated on use (a
  reused refresh token ends all sessions). Email links single-use.
- Rate limits on register, login (per address and per IP) and forgot.
- The `period` part of each document is encrypted at rest
  (AES-256-GCM) with a key the API generates on first run in
  `~/toojibee-secrets.php` (outside the web root, mode 600).
- `lib/` is never served (`.htaccess`); DB credentials live in
  `~/toojibee-config.php`, outside the web root and outside git.

## Setup on the host
Nothing to do: deploy the site package (`deploy/build-site-zip.ps1` puts
this folder at `public_html/api/`). With no config file the API uses a
SQLite database at `/home/toojibee/toojibee-data/toojibee.sqlite`
(outside the web root, created with its tables on the first request).
Check `https://toojibee.ir/api/v1/health` → `{"ok":true,"backend":"php"}`.

Moving to MySQL later (more users): cPanel → **MySQL Database Wizard**
(database and user `toojibee_app`, ALL PRIVILEGES), then copy
`config.sample.php` to `/home/toojibee/toojibee-config.php` with that
password. The config file takes over from SQLite; existing accounts
would need copying across first.

Back up `/home/toojibee/toojibee-data/` and `toojibee-secrets.php`
together: without the key, the period data can't be read.

Requires PHP 7.4+ with PDO SQLite (or MySQL) and OpenSSL, standard on cPanel.
