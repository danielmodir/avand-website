-- =============================================================================
-- Toojibee — one-time MySQL server setup (run as root / an admin account)
-- =============================================================================
-- Creates one database per module and one MySQL user per database:
--   tj_<module>  the API's account: data only (SELECT/INSERT/UPDATE/DELETE),
--                and only on its own database
--   tj_migrator  runs `manage.py migrate_all`: may change tables, nothing else
-- A leaked tj_planning password can't read accounts or period data.
--
-- Before running: replace every CHANGE_ME_* with a long random password
-- (e.g. python -c "import secrets; print(secrets.token_urlsafe(32))") and
-- put the same values in backend/.env. Replace 'localhost' with the API
-- server's address if MySQL runs on another machine.
-- Tables are created by Django migrations, not by this file.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS toojibee_core          CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS toojibee_calendar      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS toojibee_planning      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS toojibee_period        CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS toojibee_social        CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS toojibee_notifications CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- ── migrator ─────────────────────────────────────────────────────────────
CREATE USER IF NOT EXISTS 'tj_migrator'@'localhost' IDENTIFIED BY 'CHANGE_ME_MIGRATOR';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON toojibee_core.*          TO 'tj_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON toojibee_calendar.*      TO 'tj_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON toojibee_planning.*      TO 'tj_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON toojibee_period.*        TO 'tj_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON toojibee_social.*        TO 'tj_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON toojibee_notifications.* TO 'tj_migrator'@'localhost';

-- ── one account per module database ─────────────────────────────────────
CREATE USER IF NOT EXISTS 'tj_core'@'localhost'          IDENTIFIED BY 'CHANGE_ME_CORE';
CREATE USER IF NOT EXISTS 'tj_calendar'@'localhost'      IDENTIFIED BY 'CHANGE_ME_CALENDAR';
CREATE USER IF NOT EXISTS 'tj_planning'@'localhost'      IDENTIFIED BY 'CHANGE_ME_PLANNING';
CREATE USER IF NOT EXISTS 'tj_period'@'localhost'        IDENTIFIED BY 'CHANGE_ME_PERIOD';
CREATE USER IF NOT EXISTS 'tj_social'@'localhost'        IDENTIFIED BY 'CHANGE_ME_SOCIAL';
CREATE USER IF NOT EXISTS 'tj_notifications'@'localhost' IDENTIFIED BY 'CHANGE_ME_NOTIFICATIONS';

GRANT SELECT, INSERT, UPDATE, DELETE ON toojibee_core.*          TO 'tj_core'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON toojibee_calendar.*      TO 'tj_calendar'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON toojibee_planning.*      TO 'tj_planning'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON toojibee_period.*        TO 'tj_period'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON toojibee_social.*        TO 'tj_social'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON toojibee_notifications.* TO 'tj_notifications'@'localhost';

FLUSH PRIVILEGES;
