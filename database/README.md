# database/ — MySQL setup

One MySQL **database per module**. The tables themselves are defined by
the Django models and migrations in `backend/apps/<module>/`; this
folder only holds the one-time server setup.

| Database | Django app | Holds |
|---|---|---|
| `toojibee_core` | `core` (+ Django auth/admin) | accounts, Google sign-in, sessions, profile, settings, module registry, files, privacy/terms + consent, releases, email queue, admin roles |
| `toojibee_calendar` | `calendar_data` | occasions, Iran's official Hijri month starts |
| `toojibee_planning` | `planning` | categories, tasks + subtasks, per-day ticks, habits + logs, events, exceptions, attachments |
| `toojibee_period` | `period` | encrypted cycle data (per-user key, crypto-shredding) |
| `toojibee_social` | `social` | connections, invites, abuse reports |
| `toojibee_notifications` | `notifications` | push devices, quiet hours, delivery log (inactive until the app exists) |

Requires **MySQL 8.0.16+** (CHECK constraints are enforced from 8.0.16).

## Setup

1. Edit `setup.sql`: replace every `CHANGE_ME_*` with a long random
   password, then run it once as root (`mysql -u root -p < setup.sql`, or
   open it in MySQL Workbench).
2. Put the same passwords in `backend/.env` (see `backend/.env.example`).
3. From `backend/`:
   ```
   DJANGO_DB_ROLE=migrator python manage.py migrate_all
   ```
   This creates every table, loads the module registry, the occasions
   dataset and the official Hijri months, and creates the admin roles.
4. `python manage.py createsuperuser` for the first admin.

## Rules

- **No cross-database foreign keys.** Module tables refer to users by a
  plain `user_id` column (`config/routers.py` refuses relations across
  databases). Integrity comes from the account purge job
  (`purge_accounts`) and the periodic `check_orphans` report.
- **Least privilege:** at runtime the API connects to each database with
  its own `tj_<module>` user; only `DJANGO_DB_ROLE=migrator` uses
  `tj_migrator`.
- **New module:** a new Django app, a new database + user here, an
  entry in `MODULE_DATABASES` (settings) and `APP_DATABASES` (router),
  a purge handler in `PURGE_HANDLERS`, and a row in the `Module` registry.
- **Production server:** `require_secure_transport = ON` (and
  `DB_SSL=true` in `.env`), no remote root login, encrypted daily
  backups of each database. Keep `PERIOD_KEKS` out of those backups.
