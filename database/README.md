# database/ — Toojibee MySQL databases

One MySQL **database per module**, each in its own folder. A new desktop
or feature = a new folder here + one row in `toojibee_core.modules`.

```
database/
  core/            toojibee_core           accounts, profile, settings, module registry, files, admin
  planning/        toojibee_planning       categories, tasks + subtasks, habits, events
  period/          toojibee_period         cycle data, encrypted per user
  social/          toojibee_social         connections, invites, abuse reports
  notifications/   toojibee_notifications  push devices, delivery log (inactive until the app exists)
    migrations/    NNN_name.sql, applied in order, never edited once applied
    seeds/         dev_NNN_name.sql, development data only
```

Requires **MySQL 8.0.19+** (CHECK constraints, expression defaults,
`INSERT … AS new` upserts, `REGEXP_LIKE`, `UUID_TO_BIN`).

## Commands (from `backend/`, with `.env` filled in)

| Command | What it does |
|---|---|
| `npm run db:setup` | Creates every `toojibee_*` database, the `tj_migrator` user and one `tj_<module>` user per database. Needs `DB_ADMIN_*`; run once per server. |
| `npm run db:migrate` | Applies pending migrations, `core` first. Stops if an already-applied file was edited (checksum). |
| `npm run db:status` | Lists applied and pending migrations. |
| `npm run db:seed` | Loads `seeds/dev_*.sql` (test account `dev@toojibee.test`). Refuses when `NODE_ENV=production`. |

The SQL files use `DELIMITER` for triggers, so they also run as-is in the
`mysql` CLI or MySQL Workbench.

## Conventions (every database)

| Topic | Rule |
|---|---|
| Ids | `BINARY(16)` UUIDv7, `UUID_TO_BIN(uuid)` without the swap flag. Time-ordered, so inserts stay append-only; clients can create ids offline. |
| Time | UTC `DATETIME(3)`; every connection sets `time_zone = '+00:00'`. Dates the user picks (`start_date`, …) are plain `DATE` in their own calendar day. |
| Sync | User data has `version`, `updated_at` (indexed with `user_id`) and `deleted_at`. Clients pull "changed since T" including deletions; writes send the `version` they read and are rejected if it moved (optimistic locking). |
| Completion | Never a single flag on a repeating item: `task_occurrences` / `habit_logs` hold one row per day. |
| Hashes | Raw SHA-256 in `BINARY(32)` for tokens and files. |
| Charset | `utf8mb4` / `utf8mb4_0900_ai_ci` (case-insensitive, Persian and emoji safe); `utf8mb4_bin` where case matters (invite codes). |
| Cross-database ids | `user_id` outside `core` points at `toojibee_core.users.id` without a FOREIGN KEY (MySQL cannot enforce it across separately-run databases). Integrity comes from the purge job and a periodic orphan check. |
| Rules | CHECK constraints for single-row rules, triggers (`SIGNAL '45000'` with a stable message key) for rules that look at other rows. The API validates first; these are the last line of defense. |

## Security model

- **Least privilege:** the API connects to each database with its own
  `tj_<module>` user that can only `SELECT/INSERT/UPDATE/DELETE` in that
  one database. A leaked planning credential cannot read period data or
  accounts. Only `tj_migrator` can change tables.
- **No secrets in clear:** passwords are Argon2id/bcrypt; session, email
  and invite tokens are stored only as SHA-256; queued email payloads are
  wiped after sending.
- **Health data:** `toojibee_period` is encrypted with a per-user data
  key wrapped by a master key that lives outside MySQL. Deleting the
  user's key row makes their data unreadable even in old backups.
- **Ownership:** every user-owned row has `user_id`; the API always
  filters by it, and triggers reject rows whose parent belongs to another
  user.
- **Auditing:** sign-in events in `core.auth_events`, every admin action
  in `core.admin_audit_log`.
- **Account deletion:** 30-day grace period, then `core.user_purge_tasks`
  drives an idempotent purge in every module database; the `users` row
  goes last.
- **Server settings (production):** `require_secure_transport = ON`,
  `sql_mode` strict, TLS from the API, encrypted daily backups per
  database, no remote root login. If binary logging is on, set
  `log_bin_trust_function_creators = 1` so `tj_migrator` can create
  triggers without SUPER.

## Retention jobs (run by the API's scheduler)

| Data | Kept |
|---|---|
| Expired / revoked sessions, used or expired auth tokens | 30 days |
| `core.auth_events` | 90 days |
| `notifications.notification_log` | 30 days |
| Soft-deleted rows (`deleted_at`) | 90 days, then hard-deleted |
| Files with `deleted_at` | physical file removed by the cleanup job, row after 30 days |

## Adding a module

1. `database/<key>/migrations/001_<key>_schema.sql` (+ `README.md`).
2. A migration in `core` that inserts the `modules` row.
3. `DB_<KEY>_PASSWORD` in `.env`, then `npm run db:setup` and `npm run db:migrate`.
4. A `purge(user_id)` handler in `backend/src/modules/<key>/`.
