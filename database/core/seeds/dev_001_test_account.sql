-- =============================================================================
-- toojibee_core — DEVELOPMENT seed. Never run against production
-- (backend/scripts/db.js refuses when NODE_ENV=production).
-- =============================================================================
-- One test account, also super_admin so the admin screens can be tried.
--
--   email:    dev@toojibee.test
--   password: dev-d81ca5134918
--
-- The same user id is used by the other databases' dev seeds.
-- Re-runnable: removes the account first (everything in core cascades).
-- =============================================================================

SET NAMES utf8mb4;
SET @uid = UUID_TO_BIN('01928f3a-0c00-7000-8000-000000000001');

DELETE FROM users WHERE id = @uid;

INSERT INTO users (id, email, email_verified_at, password_hash)
VALUES (@uid, 'dev@toojibee.test', CURRENT_TIMESTAMP(3),
        '$2a$12$.FyKfN/8HtLHTEXcnbT2YOTJqSEUR7CbM6WzW6pVjTQtuCF.SfBpu');

INSERT INTO profiles (user_id, first_name, last_name, username, public_id, gender)
VALUES (@uid, 'Dev', 'User', 'devuser', 'DEVUSER1', 'female');

INSERT INTO user_settings (user_id, onboarding_completed_at) VALUES (@uid, CURRENT_TIMESTAMP(3));

INSERT INTO user_modules (user_id, module_key, enabled, position, enabled_at) VALUES
  (@uid, 'occasions', TRUE, 0, CURRENT_TIMESTAMP(3)),
  (@uid, 'planning',  TRUE, 1, CURRENT_TIMESTAMP(3)),
  (@uid, 'period',    TRUE, 2, CURRENT_TIMESTAMP(3)),
  (@uid, 'social',    TRUE, 3, CURRENT_TIMESTAMP(3));

INSERT INTO user_roles (user_id, role_key) VALUES (@uid, 'super_admin');
