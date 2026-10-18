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
| POST | /auth/register | email, password (8+), first_name, last_name → tokens; sends a verify email |
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

## Setup on the host (once)
1. cPanel → **MySQL Database Wizard**: database `app`, user `app`
   (cPanel prefixes both: `toojibee_app`), a strong generated password,
   **ALL PRIVILEGES** on that database.
2. Copy `config.sample.php` to the account home as
   `/home/toojibee/toojibee-config.php` and put that password in it.
3. Deploy the site package (`deploy/build-site-zip.ps1` puts this folder
   at `public_html/api/`). Tables are created on the first request.
4. Check `https://toojibee.ir/api/v1/health` → `{"ok":true,"backend":"php"}`.

Requires PHP 7.4+ with PDO MySQL and OpenSSL (standard on cPanel).
