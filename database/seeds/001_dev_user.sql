-- =============================================================================
-- Development seed — NEVER run against production.
-- =============================================================================
-- One demo account with today's sample task (three subtasks, first one
-- done), matching what /demo/ shows on a fresh start.
--
--   email:    dev@toojibee.test
--   password: dev-d81ca5134918
--
-- Re-runnable: deletes the demo user first (everything else cascades).
-- =============================================================================

SET NAMES utf8mb4;

DELETE FROM users WHERE email = 'dev@toojibee.test';

SET @uid = '51c9c251-8554-4af1-a62e-f56cafcae148';

INSERT INTO users (id, email, password_hash)
VALUES (@uid, 'dev@toojibee.test', '$2a$12$.FyKfN/8HtLHTEXcnbT2YOTJqSEUR7CbM6WzW6pVjTQtuCF.SfBpu');

INSERT INTO profiles (user_id, first_name, last_name, username)
VALUES (@uid, 'Dev', 'User', 'devuser');

INSERT INTO user_settings (user_id) VALUES (@uid);

INSERT INTO tasks (id, user_id, title, date, subtasks, recurrence, notification)
VALUES (
  '13036de8-27d9-4c17-92cf-5200689669fa', @uid, 'آماده کردن ارائه', CURDATE(),
  JSON_ARRAY(
    JSON_OBJECT('id', 's1', 'text', 'جمع‌آوری منابع', 'done', TRUE),
    JSON_OBJECT('id', 's2', 'text', 'نوشتن اسلایدها', 'done', FALSE),
    JSON_OBJECT('id', 's3', 'text', 'تمرین ارائه', 'done', FALSE)
  ),
  JSON_OBJECT('mode', NULL, 'interval', 1, 'weekdays', JSON_ARRAY()),
  JSON_OBJECT('type', NULL)
);
