-- =============================================================================
-- Avand — PostgreSQL schema
-- =============================================================================
-- Mirrors the data shape already used by the client-side prototype
-- (demo/index.html's `state.tasks` / `state.habits` / `state.events` /
-- `state.profile` / `state.settings`), normalized into real tables.
--
-- Design choices, spelled out because they're each a deliberate call:
--
-- 1. Recurrence and notification fields live directly ON tasks/habits/events
--    as columns, not in separate polymorphic tables. Every item has at most
--    ONE recurrence rule and ONE notification setting (see the prototype's
--    `recurrence:{mode,interval,weekdays}` / `notification:{type,...}`) — a
--    genuine 1:1 relationship, so a join table would only add a mandatory
--    join to every query for no relational benefit. Subtasks and photos DO
--    get their own tables, because those are genuine 1:many collections.
--
-- 2. `weekdays` uses Postgres's native SMALLINT[] rather than a join table,
--    since it's a small fixed-size set (0-6) always read/written as a whole
--    with its owning row, never queried "which tasks run on Tuesday" style.
--
-- 3. UUIDs (not serial ints) for primary keys — safe to generate client-side
--    (e.g. offline-first mobile) before syncing, and don't leak row counts.
--
-- 4. `sessions` exists even though the current UI only mocks auth, so the
--    schema is ready for the day auth actually connects to a backend
--    (per docs/avand_mvp-scope-amendments_v1.md §2.4's own note that this
--    still needs to happen) instead of needing a follow-up migration.
-- =============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists citext;   -- case-insensitive email column

-- ── enums ────────────────────────────────────────────────────────────────
create type time_mode as enum ('single', 'range');
create type recurrence_mode as enum ('interval', 'weekdays');
create type notification_type as enum ('time', 'repeating');
create type calendar_system as enum ('gregorian', 'jalali', 'hijri');
create type app_language as enum ('en', 'fa');

-- ── users & auth ─────────────────────────────────────────────────────────
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text not null,
  name          text not null,
  avatar_url    text,                    -- null = show initials, per the UI
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,       -- store a hash, never the raw token
  user_agent  text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index sessions_user_id_idx on sessions(user_id);

create table user_settings (
  user_id                 uuid primary key references users(id) on delete cascade,
  language                app_language not null default 'fa',
  calendar_system         calendar_system not null default 'jalali',
  week_start_day          smallint not null default 6 check (week_start_day between 0 and 6), -- 0=Sun..6=Sat
  notifications_enabled   boolean not null default true,
  show_add_menu_labels    boolean not null default true,
  theme                   text not null default 'dark' check (theme in ('dark', 'light')),
  updated_at              timestamptz not null default now()
);

-- ── categories (simple label, per SPEC §MVP — no folders yet) ────────────
create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ── tasks ─────────────────────────────────────────────────────────────────
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  title         text not null,
  description   text not null default '',
  pinned        boolean not null default false,
  done          boolean not null default false,

  time_mode     time_mode not null default 'single',
  date          date not null,           -- start date (single or range)
  end_date      date,                    -- only set when time_mode = 'range'
  check (time_mode = 'single' or end_date is not null),
  check (end_date is null or end_date >= date),

  recurrence_mode      recurrence_mode,          -- null = one-off, no repeat
  recurrence_interval  smallint not null default 1 check (recurrence_interval >= 1),
  recurrence_weekdays  smallint[] not null default '{}',

  notification_type          notification_type,
  notification_time          time,              -- used when type = 'time'
  notification_repeat_hours  smallint,           -- used when type = 'repeating'
  notification_text          text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tasks_user_date_idx on tasks(user_id, date);
create index tasks_category_idx on tasks(category_id);

create table task_subtasks (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references tasks(id) on delete cascade,
  text      text not null,
  done      boolean not null default false,
  position  smallint not null default 0
);
create index task_subtasks_task_idx on task_subtasks(task_id);
-- Max 3 subtasks per task (SPEC §MVP) — enforced in the API layer, not here:
-- a check constraint can't count sibling rows, and a trigger is overkill
-- for a rule this soft (product may relax it before a real backend ships).

create table task_photos (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references tasks(id) on delete cascade,
  url       text not null,
  position  smallint not null default 0
);
create index task_photos_task_idx on task_photos(task_id);
-- Max 3 photos per task (SPEC §MVP) — same note as above, enforced in the API.

-- ── habits ────────────────────────────────────────────────────────────────
create table habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null,
  start_date    date not null,

  recurrence_mode      recurrence_mode not null default 'interval',
  recurrence_interval  smallint not null default 1 check (recurrence_interval >= 1),
  recurrence_weekdays  smallint[] not null default '{}',

  notification_type          notification_type,
  notification_time          time,
  notification_repeat_hours  smallint,
  notification_text          text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index habits_user_idx on habits(user_id);

create table habit_completions (
  habit_id        uuid not null references habits(id) on delete cascade,
  completed_date  date not null,
  primary key (habit_id, completed_date)
);

-- ── events ────────────────────────────────────────────────────────────────
create table events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null,

  time_mode     time_mode not null default 'single',
  date          date not null,
  end_date      date,
  check (time_mode = 'single' or end_date is not null),
  check (end_date is null or end_date >= date),

  recurrence_mode      recurrence_mode,
  recurrence_interval  smallint not null default 1 check (recurrence_interval >= 1),
  recurrence_weekdays  smallint[] not null default '{}',

  notification_type          notification_type,
  notification_time          time,
  notification_repeat_hours  smallint,
  notification_text          text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index events_user_date_idx on events(user_id, date);

-- ── updated_at bookkeeping ────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();
create trigger habits_set_updated_at before update on habits
  for each row execute function set_updated_at();
create trigger events_set_updated_at before update on events
  for each row execute function set_updated_at();
