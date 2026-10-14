# database/ — MySQL schema

Schema for the Toojibee API in `backend/`. MySQL **8.0.16 or newer**
(older versions ignore CHECK constraints and lack JSON column defaults).

```
database/
  schema.sql          full schema in one file (snapshot, generated)
  migrations/         source of truth, applied in file-name order
    001_initial_schema.sql
  seeds/              development data only
    001_dev_user.sql  demo account + today's sample task
```

## Tables

| Table           | Holds                                                         |
|-----------------|---------------------------------------------------------------|
| `users`         | email + bcrypt password hash                                  |
| `sessions`      | one row per login (SHA-256 of the token, expiry)              |
| `profiles`      | name, username, phone, gender, birth date, photo              |
| `user_settings` | language, calendar system, week start, notifications, theme   |
| `tasks`         | tasks with subtasks / photos / recurrence / notification JSON |
| `habits`        | habits with check-in and skipped dates as JSON arrays         |
| `events`        | events                                                        |
| `connections`   | friends: one row per user pair, pending / accepted / blocked  |

Why JSON columns instead of child tables, and the other design choices,
are explained at the top of `migrations/001_initial_schema.sql`.

## Setup

```sql
CREATE DATABASE toojibee CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'toojibee'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON toojibee.* TO 'toojibee'@'localhost';
```

Then from `backend/` (with `.env` filled in):

```
npm run migrate   # applies new files from migrations/, tracked in schema_migrations
npm run seed      # optional, development only
```

## Changing the schema

1. Add `migrations/NNN_short_name.sql` with the next number. Never edit a
   migration that has already been applied anywhere.
2. Run `npm run migrate`.
3. Regenerate the snapshot: concatenate all migrations into `schema.sql`
   under its header comment.
