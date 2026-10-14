-- =============================================================================
-- toojibee_planning — 001: schema
-- =============================================================================
-- The Planning desktop: categories, tasks (with one level of subtasks),
-- habits and events, plus per-day completion rows.
--
-- user_id refers to toojibee_core.users.id. It is not a foreign key:
-- the databases are separate, so account deletion reaches this database
-- through the purge job (see toojibee_core.user_purge_tasks).
--
-- Every user-owned row carries version / updated_at / deleted_at so that
-- an offline client can pull "everything changed since T", including
-- deletions, and the API can reject stale writes (optimistic locking on
-- version).
--
-- Recurrence: rec_weekdays is a 7-bit mask, bit 0 = Sunday … bit 6 =
-- Saturday (JavaScript's Date.getDay() order).
-- Editing a recurring item:
--   "only this day"       -> add an *_exceptions row for that date and a
--                            new standalone row with origin_* pointing back
--   "this and following"  -> set rec_until on the old row, start a new row
--   "all"                 -> update the row itself
-- =============================================================================

SET NAMES utf8mb4;

-- ── categories ───────────────────────────────────────────────────────────
CREATE TABLE categories (
  id          BINARY(16)   NOT NULL,
  user_id     BINARY(16)   NOT NULL,
  name        VARCHAR(40)  NOT NULL,
  color       CHAR(7)      NULL,                          -- #RRGGBB
  sort_order  INT          NOT NULL DEFAULT 0,
  version     INT UNSIGNED NOT NULL DEFAULT 1,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)  NULL,
  -- 1 while the row is live, NULL once deleted: lets a deleted category's
  -- name be reused (UNIQUE ignores NULLs).
  live        TINYINT AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY categories_name_uq (user_id, name, live),
  KEY categories_sync_idx (user_id, updated_at),
  CONSTRAINT categories_name_ck CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT categories_color_ck CHECK (color IS NULL OR REGEXP_LIKE(color, '^#[0-9A-Fa-f]{6}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── tasks ────────────────────────────────────────────────────────────────
-- A subtask is a task with parent_id set: same columns, same behavior
-- (range, reminder, selection…). Only one level deep, and a subtask does
-- not repeat on its own; both rules are enforced by the triggers below.
-- Completion is never stored here: see task_occurrences.
CREATE TABLE tasks (
  id                    BINARY(16)   NOT NULL,
  user_id               BINARY(16)   NOT NULL,
  parent_id             BINARY(16)   NULL,
  category_id           BINARY(16)   NULL,
  title                 VARCHAR(300) NOT NULL,
  description           TEXT         NULL,
  pinned                BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order            INT          NOT NULL DEFAULT 0,
  start_date            DATE         NOT NULL,
  end_date              DATE         NULL,                -- deadline; NULL = single day
  rec_mode              ENUM('none', 'interval', 'weekdays') NOT NULL DEFAULT 'none',
  rec_interval          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  rec_weekdays          TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  rec_until             DATE         NULL,
  reminder_type         ENUM('none', 'at_time', 'repeating') NOT NULL DEFAULT 'none',
  reminder_time         TIME         NULL,
  reminder_every_hours  TINYINT UNSIGNED NULL,
  reminder_text         VARCHAR(200) NULL,
  origin_task_id        BINARY(16)   NULL,                -- set on a row split off a recurring series
  origin_date           DATE         NULL,
  version               INT UNSIGNED NOT NULL DEFAULT 1,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at            DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY tasks_user_date_idx (user_id, start_date),
  KEY tasks_sync_idx (user_id, updated_at),
  KEY tasks_parent_idx (parent_id),
  KEY tasks_category_idx (category_id),
  KEY tasks_origin_idx (origin_task_id),
  CONSTRAINT tasks_parent_fk FOREIGN KEY (parent_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT tasks_category_fk FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT tasks_origin_fk FOREIGN KEY (origin_task_id) REFERENCES tasks (id) ON DELETE SET NULL,
  CONSTRAINT tasks_title_ck CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT tasks_range_ck CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT tasks_interval_ck CHECK (rec_interval BETWEEN 1 AND 365),
  CONSTRAINT tasks_weekdays_ck CHECK (rec_weekdays <= 127 AND (rec_mode <> 'weekdays' OR rec_weekdays > 0)),
  CONSTRAINT tasks_until_ck CHECK (rec_until IS NULL OR (rec_mode <> 'none' AND rec_until >= start_date)),
  CONSTRAINT tasks_reminder_ck CHECK (
    (reminder_type = 'none') OR
    (reminder_type = 'at_time' AND reminder_time IS NOT NULL) OR
    (reminder_type = 'repeating' AND reminder_time IS NOT NULL AND reminder_every_hours BETWEEN 1 AND 24)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Done / not done for each day a task occurs on. A one-off task has one
-- row (its start date); a recurring task has one row per day it was
-- ticked. 'pending' means "cleared again", kept as a row instead of a
-- delete so other devices see the change through updated_at.
CREATE TABLE task_occurrences (
  task_id          BINARY(16)  NOT NULL,
  occurrence_date  DATE        NOT NULL,
  user_id          BINARY(16)  NOT NULL,                  -- copied from the task for indexed per-user queries
  status           ENUM('pending', 'done', 'not_done') NOT NULL,
  completed_at     DATETIME(3) NULL,
  version          INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_id, occurrence_date),
  KEY task_occurrences_user_date_idx (user_id, occurrence_date),
  KEY task_occurrences_sync_idx (user_id, updated_at),
  CONSTRAINT task_occurrences_task_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT task_occurrences_done_ck CHECK ((status = 'done') = (completed_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Days removed from a recurring task's series. deleted_at undoes it.
CREATE TABLE task_exceptions (
  task_id          BINARY(16)  NOT NULL,
  occurrence_date  DATE        NOT NULL,
  user_id          BINARY(16)  NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3) NULL,
  PRIMARY KEY (task_id, occurrence_date),
  KEY task_exceptions_sync_idx (user_id, updated_at),
  CONSTRAINT task_exceptions_task_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Photos on a task; file_id refers to toojibee_core.files.id. At most 3
-- live photos per task (trigger below).
CREATE TABLE task_attachments (
  task_id     BINARY(16)  NOT NULL,
  file_id     BINARY(16)  NOT NULL,
  user_id     BINARY(16)  NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3) NULL,
  PRIMARY KEY (task_id, file_id),
  KEY task_attachments_sync_idx (user_id, updated_at),
  KEY task_attachments_file_idx (file_id),
  CONSTRAINT task_attachments_task_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── habits ───────────────────────────────────────────────────────────────
-- Habits always repeat, so rec_mode has no 'none'.
CREATE TABLE habits (
  id                    BINARY(16)   NOT NULL,
  user_id               BINARY(16)   NOT NULL,
  category_id           BINARY(16)   NULL,
  title                 VARCHAR(300) NOT NULL,
  start_date            DATE         NOT NULL,
  end_date              DATE         NULL,
  rec_mode              ENUM('interval', 'weekdays') NOT NULL DEFAULT 'interval',
  rec_interval          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  rec_weekdays          TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  reminder_type         ENUM('none', 'at_time', 'repeating') NOT NULL DEFAULT 'none',
  reminder_time         TIME         NULL,
  reminder_every_hours  TINYINT UNSIGNED NULL,
  reminder_text         VARCHAR(200) NULL,
  sort_order            INT          NOT NULL DEFAULT 0,
  version               INT UNSIGNED NOT NULL DEFAULT 1,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at            DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY habits_user_idx (user_id, start_date),
  KEY habits_sync_idx (user_id, updated_at),
  KEY habits_category_idx (category_id),
  CONSTRAINT habits_category_fk FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT habits_title_ck CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT habits_range_ck CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT habits_interval_ck CHECK (rec_interval BETWEEN 1 AND 365),
  CONSTRAINT habits_weekdays_ck CHECK (rec_weekdays <= 127 AND (rec_mode <> 'weekdays' OR rec_weekdays > 0)),
  CONSTRAINT habits_reminder_ck CHECK (
    (reminder_type = 'none') OR
    (reminder_type = 'at_time' AND reminder_time IS NOT NULL) OR
    (reminder_type = 'repeating' AND reminder_time IS NOT NULL AND reminder_every_hours BETWEEN 1 AND 24)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per habit per day: done, explicitly skipped, or cleared again.
CREATE TABLE habit_logs (
  habit_id    BINARY(16)  NOT NULL,
  log_date    DATE        NOT NULL,
  user_id     BINARY(16)  NOT NULL,
  status      ENUM('pending', 'done', 'skipped') NOT NULL,
  version     INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (habit_id, log_date),
  KEY habit_logs_user_date_idx (user_id, log_date),
  KEY habit_logs_sync_idx (user_id, updated_at),
  CONSTRAINT habit_logs_habit_fk FOREIGN KEY (habit_id) REFERENCES habits (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── events ───────────────────────────────────────────────────────────────
-- Events can have a real time of day (all_day = FALSE) and a reminder
-- relative to their start ('before_start').
CREATE TABLE events (
  id                       BINARY(16)   NOT NULL,
  user_id                  BINARY(16)   NOT NULL,
  category_id              BINARY(16)   NULL,
  title                    VARCHAR(300) NOT NULL,
  start_date               DATE         NOT NULL,
  end_date                 DATE         NULL,
  all_day                  BOOLEAN      NOT NULL DEFAULT TRUE,
  start_time               TIME         NULL,
  end_time                 TIME         NULL,
  rec_mode                 ENUM('none', 'interval', 'weekdays') NOT NULL DEFAULT 'none',
  rec_interval             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  rec_weekdays             TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  rec_until                DATE         NULL,
  reminder_type            ENUM('none', 'at_time', 'repeating', 'before_start') NOT NULL DEFAULT 'none',
  reminder_time            TIME         NULL,
  reminder_every_hours     TINYINT UNSIGNED NULL,
  reminder_minutes_before  SMALLINT UNSIGNED NULL,
  reminder_text            VARCHAR(200) NULL,
  origin_event_id          BINARY(16)   NULL,
  origin_date              DATE         NULL,
  version                  INT UNSIGNED NOT NULL DEFAULT 1,
  created_at               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at               DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY events_user_date_idx (user_id, start_date),
  KEY events_sync_idx (user_id, updated_at),
  KEY events_category_idx (category_id),
  KEY events_origin_idx (origin_event_id),
  CONSTRAINT events_category_fk FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT events_origin_fk FOREIGN KEY (origin_event_id) REFERENCES events (id) ON DELETE SET NULL,
  CONSTRAINT events_title_ck CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT events_range_ck CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT events_time_ck CHECK (
    (all_day AND start_time IS NULL AND end_time IS NULL) OR
    (NOT all_day AND start_time IS NOT NULL AND
      (end_time IS NULL OR end_date IS NOT NULL OR end_time > start_time))
  ),
  CONSTRAINT events_interval_ck CHECK (rec_interval BETWEEN 1 AND 365),
  CONSTRAINT events_weekdays_ck CHECK (rec_weekdays <= 127 AND (rec_mode <> 'weekdays' OR rec_weekdays > 0)),
  CONSTRAINT events_until_ck CHECK (rec_until IS NULL OR (rec_mode <> 'none' AND rec_until >= start_date)),
  CONSTRAINT events_reminder_ck CHECK (
    (reminder_type = 'none') OR
    (reminder_type = 'at_time' AND reminder_time IS NOT NULL) OR
    (reminder_type = 'repeating' AND reminder_time IS NOT NULL AND reminder_every_hours BETWEEN 1 AND 24) OR
    (reminder_type = 'before_start' AND NOT all_day AND reminder_minutes_before BETWEEN 0 AND 10080)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE event_exceptions (
  event_id         BINARY(16)  NOT NULL,
  occurrence_date  DATE        NOT NULL,
  user_id          BINARY(16)  NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3) NULL,
  PRIMARY KEY (event_id, occurrence_date),
  KEY event_exceptions_sync_idx (user_id, updated_at),
  CONSTRAINT event_exceptions_event_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── integrity triggers ───────────────────────────────────────────────────
-- Rules a CHECK constraint cannot express because they look at other
-- rows. Last line of defense: the API validates the same things first and
-- returns a friendly error; these stop a buggy or hostile write anyway.
-- SQLSTATE 45000 errors carry a stable message the API maps to a 400.

DELIMITER $$

CREATE TRIGGER tasks_hierarchy_bi BEFORE INSERT ON tasks
FOR EACH ROW
BEGIN
  DECLARE p_user BINARY(16);
  DECLARE p_parent BINARY(16);
  IF NEW.parent_id IS NOT NULL THEN
    SET p_user = (SELECT user_id FROM tasks WHERE id = NEW.parent_id);
    SET p_parent = (SELECT parent_id FROM tasks WHERE id = NEW.parent_id);
    IF p_user IS NULL OR p_user <> NEW.user_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.parent_not_found';
    END IF;
    IF p_parent IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.subtask_depth';
    END IF;
    IF NEW.rec_mode <> 'none' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.subtask_recurring';
    END IF;
  END IF;
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.category_id AND user_id = NEW.user_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.category_not_found';
  END IF;
END$$

CREATE TRIGGER tasks_hierarchy_bu BEFORE UPDATE ON tasks
FOR EACH ROW
BEGIN
  DECLARE p_user BINARY(16);
  DECLARE p_parent BINARY(16);
  IF NEW.user_id <> OLD.user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.owner_immutable';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.subtask_depth';
    END IF;
    SET p_user = (SELECT user_id FROM tasks WHERE id = NEW.parent_id);
    SET p_parent = (SELECT parent_id FROM tasks WHERE id = NEW.parent_id);
    IF p_user IS NULL OR p_user <> NEW.user_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.parent_not_found';
    END IF;
    IF p_parent IS NOT NULL OR EXISTS (SELECT 1 FROM tasks WHERE parent_id = NEW.id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.subtask_depth';
    END IF;
    IF NEW.rec_mode <> 'none' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.subtask_recurring';
    END IF;
  END IF;
  IF NEW.category_id IS NOT NULL AND (OLD.category_id IS NULL OR NEW.category_id <> OLD.category_id)
     AND NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND user_id = NEW.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task.category_not_found';
  END IF;
END$$

CREATE TRIGGER task_occurrences_owner_bi BEFORE INSERT ON task_occurrences
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND user_id = NEW.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_occurrence.owner_mismatch';
  END IF;
END$$

CREATE TRIGGER task_exceptions_owner_bi BEFORE INSERT ON task_exceptions
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND user_id = NEW.user_id AND rec_mode <> 'none') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_exception.invalid_task';
  END IF;
END$$

CREATE TRIGGER task_attachments_limit_bi BEFORE INSERT ON task_attachments
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND user_id = NEW.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_attachment.owner_mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM task_attachments WHERE task_id = NEW.task_id AND deleted_at IS NULL) >= 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_attachment.limit';
  END IF;
END$$

CREATE TRIGGER habits_category_bi BEFORE INSERT ON habits
FOR EACH ROW
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.category_id AND user_id = NEW.user_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'habit.category_not_found';
  END IF;
END$$

CREATE TRIGGER habits_category_bu BEFORE UPDATE ON habits
FOR EACH ROW
BEGIN
  IF NEW.user_id <> OLD.user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'habit.owner_immutable';
  END IF;
  IF NEW.category_id IS NOT NULL AND (OLD.category_id IS NULL OR NEW.category_id <> OLD.category_id)
     AND NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND user_id = NEW.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'habit.category_not_found';
  END IF;
END$$

CREATE TRIGGER habit_logs_owner_bi BEFORE INSERT ON habit_logs
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM habits WHERE id = NEW.habit_id AND user_id = NEW.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'habit_log.owner_mismatch';
  END IF;
END$$

CREATE TRIGGER events_category_bi BEFORE INSERT ON events
FOR EACH ROW
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.category_id AND user_id = NEW.user_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event.category_not_found';
  END IF;
END$$

CREATE TRIGGER events_category_bu BEFORE UPDATE ON events
FOR EACH ROW
BEGIN
  IF NEW.user_id <> OLD.user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event.owner_immutable';
  END IF;
  IF NEW.category_id IS NOT NULL AND (OLD.category_id IS NULL OR NEW.category_id <> OLD.category_id)
     AND NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND user_id = NEW.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event.category_not_found';
  END IF;
END$$

CREATE TRIGGER event_exceptions_owner_bi BEFORE INSERT ON event_exceptions
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND user_id = NEW.user_id AND rec_mode <> 'none') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event_exception.invalid_event';
  END IF;
END$$

DELIMITER ;
