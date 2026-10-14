-- =============================================================================
-- toojibee_planning — DEVELOPMENT seed (test account from core's dev seed)
-- =============================================================================
-- Today: a task with three subtasks (first one done), a daily habit and a
-- timed event. Re-runnable: removes the test account's planning data first.
-- =============================================================================

SET NAMES utf8mb4;
SET @uid = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000001');

DELETE FROM tasks WHERE user_id = @uid AND parent_id IS NOT NULL;
DELETE FROM tasks WHERE user_id = @uid;
DELETE FROM habits WHERE user_id = @uid;
DELETE FROM events WHERE user_id = @uid;
DELETE FROM categories WHERE user_id = @uid;

SET @cat   = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000401');
SET @task  = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000101');
SET @sub1  = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000102');
SET @sub2  = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000103');
SET @sub3  = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000104');
SET @habit = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000201');
SET @event = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000301');

INSERT INTO categories (id, user_id, name, color) VALUES (@cat, @uid, 'کار', '#FCA311');

INSERT INTO tasks (id, user_id, category_id, title, start_date, sort_order) VALUES
  (@task, @uid, @cat, 'آماده کردن ارائه', CURDATE(), 0);

INSERT INTO tasks (id, user_id, parent_id, title, start_date, sort_order) VALUES
  (@sub1, @uid, @task, 'جمع کردن منابع',  CURDATE(), 0),
  (@sub2, @uid, @task, 'ساختن اسلایدها',  CURDATE(), 1),
  (@sub3, @uid, @task, 'تمرین ارائه',     CURDATE(), 2);

INSERT INTO task_occurrences (task_id, occurrence_date, user_id, status, completed_at)
VALUES (@sub1, CURDATE(), @uid, 'done', CURRENT_TIMESTAMP(3));

INSERT INTO habits (id, user_id, title, start_date, rec_mode, rec_interval, reminder_type, reminder_time, reminder_text)
VALUES (@habit, @uid, '۳۰ دقیقه کتاب خواندن', CURDATE() - INTERVAL 7 DAY, 'interval', 1, 'at_time', '21:00:00', 'وقت کتاب خواندنه!');

INSERT INTO habit_logs (habit_id, log_date, user_id, status) VALUES
  (@habit, CURDATE() - INTERVAL 1 DAY, @uid, 'done'),
  (@habit, CURDATE() - INTERVAL 2 DAY, @uid, 'done');

INSERT INTO events (id, user_id, title, start_date, all_day, start_time, end_time, reminder_type, reminder_minutes_before)
VALUES (@event, @uid, 'کلاس زبان', CURDATE(), FALSE, '19:30:00', '21:00:00', 'before_start', 15);
