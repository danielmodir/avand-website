-- =============================================================================
-- toojibee_notifications — 001: schema
-- =============================================================================
-- Push delivery for reminders. Not used until the mobile app exists; the
-- module is registered with is_active = FALSE in toojibee_core.modules.
--
-- What to remind and when is defined by each module's own rows (e.g.
-- toojibee_planning.tasks.reminder_*); this database only knows where to
-- deliver and what was already delivered.
-- user_id refers to toojibee_core.users.id (separate database, no FK).
-- =============================================================================

SET NAMES utf8mb4;

-- One row per device/browser that accepted notifications.
CREATE TABLE push_subscriptions (
  id            BINARY(16)   NOT NULL,
  user_id       BINARY(16)   NOT NULL,
  platform      ENUM('web', 'android') NOT NULL,
  provider      VARCHAR(30)  NOT NULL,                   -- webpush, or the chosen Android push service
  token         TEXT         NOT NULL,                   -- endpoint URL / device token
  token_hash    BINARY(32)   NOT NULL,                   -- SHA-256 of token, for de-duplication
  web_p256dh    VARCHAR(255) NULL,                       -- Web Push keys
  web_auth      VARCHAR(255) NULL,
  device_name   VARCHAR(100) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at    DATETIME(3)  NULL,                       -- set when the provider says the token is gone
  PRIMARY KEY (id),
  UNIQUE KEY push_subscriptions_token_uq (token_hash),
  KEY push_subscriptions_user_idx (user_id, revoked_at),
  CONSTRAINT push_subscriptions_web_ck CHECK (platform <> 'web' OR (web_p256dh IS NOT NULL AND web_auth IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Quiet hours and per-module mute.
CREATE TABLE notification_preferences (
  user_id      BINARY(16)  NOT NULL,
  quiet_start  TIME        NULL,                         -- local time in the user's timezone
  quiet_end    TIME        NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT notification_preferences_quiet_ck CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notification_mutes (
  user_id     BINARY(16)  NOT NULL,
  module_key  VARCHAR(40) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, module_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every reminder the scheduler queued. The unique key makes "send this
-- reminder" idempotent: a scheduler that runs twice cannot notify twice.
-- Rows older than 30 days are purged.
CREATE TABLE notification_log (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BINARY(16)   NOT NULL,
  source_module    VARCHAR(40)  NOT NULL,                -- planning, period…
  source_type      VARCHAR(40)  NOT NULL,                -- task, habit, event…
  source_id        BINARY(16)   NOT NULL,
  occurrence_date  DATE         NULL,
  scheduled_for    DATETIME(3)  NOT NULL,                -- UTC
  status           ENUM('queued', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'queued',
  attempts         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at          DATETIME(3)  NULL,
  error            VARCHAR(500) NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY notification_log_once_uq (source_module, source_type, source_id, scheduled_for),
  KEY notification_log_queue_idx (status, scheduled_for),
  KEY notification_log_user_idx (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
