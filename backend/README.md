# backend/ — Toojibee API (Express + MySQL)

REST API for the data the `/demo/` app keeps: auth, profile, settings,
tasks, habits, events and connections (friends). The schema lives in
`../database/`.

**Not deployed and not wired to the demo yet.** The demo still talks to
Supabase through `frontend/demo/js/services/cloud.js`. Switching it over
means pointing those `Cloud.*` functions at this API; the request and
response bodies already use the same camelCase objects the app keeps in
memory, so the rest of the client does not change.

## Structure

```
backend/
  src/
    server.js            process entry: listen + graceful shutdown
    app.js               Express app (middleware + routes), no listen
    config/env.js        reads and validates .env once
    db/pool.js           mysql2 pool, query() and transaction() helpers
    middleware/
      auth.js            bearer token -> req.userId (checked against sessions)
      errors.js          404 + error -> JSON response
    utils/
      http.js            HttpError, id/date validation
      mapper.js          camelCase object <-> table columns
    routes/
      auth.js            register / login / logout
      profile.js         GET / PATCH
      settings.js        GET / PATCH
      itemRouter.js      shared list / upsert / delete for the three item kinds
      tasks.js habits.js events.js
      connections.js     friends: list, search, request, respond, remove, block
  scripts/
    migrate.js           applies ../database/migrations
    seed.js              loads ../database/seeds (refuses in production)
```

## Running locally

1. MySQL 8.0.16+ with an empty database (see `../database/README.md`).
2. `cp .env.example .env`, then fill in `DATABASE_URL` and a 32+ character `JWT_SECRET`.
3. `npm install`
4. `npm run migrate`, and optionally `npm run seed`
5. `npm run dev` (or `npm start`), then `curl http://localhost:4000/health`

## Endpoints

All except `/health`, `register` and `login` need `Authorization: Bearer <token>`.

| Method | Path                                  | Notes                                      |
|--------|---------------------------------------|--------------------------------------------|
| POST   | `/api/auth/register`                  | `{ email, password, firstName?, lastName? }` → `{ token, userId }` |
| POST   | `/api/auth/login`                     | `{ email, password }` → `{ token, userId }` |
| POST   | `/api/auth/logout`                    | revokes this token                          |
| GET/PATCH | `/api/profile`                     | `firstName lastName username phone gender dob photo` |
| GET/PATCH | `/api/settings`                    | `language calendarSystem weekStartDay notifications showAddMenuLabels theme` |
| GET    | `/api/tasks` · `/api/habits` · `/api/events` | the user's items                    |
| PUT    | `/api/tasks/:id` (same for habits, events) | upsert; the client generates the UUID |
| DELETE | `/api/tasks/:id` (same for habits, events) |                                       |
| GET    | `/api/connections`                    | with `pending-outgoing / pending-incoming / accepted / blocked` |
| GET    | `/api/connections/search?q=`          | exact username or phone only               |
| POST   | `/api/connections/:userId/request`    | sending one back to a requester accepts it |
| POST   | `/api/connections/:userId/respond`    | `{ accept: true \| false }`                 |
| DELETE | `/api/connections/:userId`            | unfriend / cancel / decline                 |
| POST/DELETE | `/api/connections/:userId/block` | block / unblock                             |

## Before this handles real users

- Rate limiting on `login` / `register` / `search`.
- Email verification and password reset.
- Photo upload storage: photos are stored inline as data URLs for now
  (max 3 per task, 6 MB request limit).
- HTTPS termination in front of it (Nginx or the host's proxy).
