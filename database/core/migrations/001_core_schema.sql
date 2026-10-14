-- =============================================================================
-- toojibee_core — 001: schema
-- =============================================================================
-- Shared by every desktop/feature module: accounts and sign-in, profile,
-- settings, the module registry, uploaded files, admin roles, editable
-- content, legal consent and outgoing email.
--
-- Conventions (same in every toojibee_* database, see database/README.md):
--   * ids are BINARY(16) UUIDv7, written with UUID_TO_BIN(uuid) (no swap
--     flag: v7 is already time-ordered, so inserts stay append-only)
--   * all times are UTC, DATETIME(3) (the API sets time_zone = '+00:00')
--   * token and file hashes are raw SHA-256 in BINARY(32), never hex text
--   * IP addresses are INET6_ATON() output in VARBINARY(16)
-- =============================================================================

SET NAMES utf8mb4;

-- ── accounts ─────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                     BINARY(16)   NOT NULL,
  email                  VARCHAR(254) NOT NULL,          -- stored lowercased by the API
  email_verified_at      DATETIME(3)  NULL,
  password_hash          VARCHAR(255) NULL,              -- Argon2id ($argon2id$…) or bcrypt ($2b$…), told apart by prefix; NULL = Google-only
  password_changed_at    DATETIME(3)  NULL,
  status                 ENUM('active', 'suspended', 'pending_deletion') NOT NULL DEFAULT 'active',
  suspended_reason       VARCHAR(255) NULL,
  deletion_requested_at  DATETIME(3)  NULL,              -- data is purged 30 days after this
  last_login_at          DATETIME(3)  NULL,
  created_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_uq (email),
  KEY users_deletion_idx (status, deletion_requested_at),
  CONSTRAINT users_deletion_ck CHECK (status <> 'pending_deletion' OR deletion_requested_at IS NOT NULL),
  CONSTRAINT users_suspension_ck CHECK (status <> 'suspended' OR suspended_reason IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sign-in through an external provider. Only Google today; phone sign-in
-- would be a new provider value here, not a new table.
CREATE TABLE oauth_accounts (
  id                BINARY(16)   NOT NULL,
  user_id           BINARY(16)   NOT NULL,
  provider          ENUM('google') NOT NULL,
  provider_user_id  VARCHAR(255) NOT NULL,               -- Google "sub" claim
  provider_email    VARCHAR(254) NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at      DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY oauth_provider_subject_uq (provider, provider_user_id),
  UNIQUE KEY oauth_user_provider_uq (user_id, provider),
  CONSTRAINT oauth_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per signed-in device. The client holds a short-lived access
-- token plus a refresh token; only the refresh token's SHA-256 is stored.
-- Refresh tokens rotate on every use: the old row gets revoked_reason
-- 'rotated' and replaced_by_id, so a replayed old token is detectable and
-- revokes the whole chain.
CREATE TABLE sessions (
  id              BINARY(16)   NOT NULL,
  user_id         BINARY(16)   NOT NULL,
  token_hash      BINARY(32)   NOT NULL,
  device_name     VARCHAR(100) NULL,
  platform        ENUM('web', 'android', 'ios') NOT NULL DEFAULT 'web',
  user_agent      VARCHAR(255) NULL,
  ip              VARBINARY(16) NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at      DATETIME(3)  NOT NULL,
  revoked_at      DATETIME(3)  NULL,
  revoked_reason  ENUM('logout', 'logout_all', 'rotated', 'reuse_detected', 'password_change', 'admin', 'account_deleted') NULL,
  replaced_by_id  BINARY(16)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY sessions_token_uq (token_hash),
  KEY sessions_user_idx (user_id, revoked_at),
  KEY sessions_expiry_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT sessions_revoked_ck CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  CONSTRAINT sessions_expiry_ck CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Single-use links sent by email. Only the hash is kept; the raw token
-- exists only inside the email.
CREATE TABLE auth_tokens (
  id          BINARY(16)   NOT NULL,
  user_id     BINARY(16)   NOT NULL,
  purpose     ENUM('verify_email', 'reset_password', 'change_email') NOT NULL,
  token_hash  BINARY(32)   NOT NULL,
  new_email   VARCHAR(254) NULL,                          -- change_email only
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at  DATETIME(3)  NOT NULL,
  used_at     DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY auth_tokens_hash_uq (token_hash),
  KEY auth_tokens_user_idx (user_id, purpose),
  KEY auth_tokens_expiry_idx (expires_at),
  CONSTRAINT auth_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT auth_tokens_email_ck CHECK ((purpose = 'change_email') = (new_email IS NOT NULL)),
  CONSTRAINT auth_tokens_expiry_ck CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Security log, also the source for rate limits (failed logins per IP and
-- per email in the last N minutes). The attempted email is kept only as a
-- SHA-256, so the log does not collect addresses of people who mistyped.
-- Rows older than 90 days are purged.
CREATE TABLE auth_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BINARY(16)   NULL,
  email_hash  BINARY(32)   NULL,
  event       ENUM('login', 'login_google', 'logout', 'logout_all', 'register',
                   'password_change', 'password_reset_request', 'password_reset',
                   'email_verify', 'email_change', 'session_reuse_detected',
                   'account_deletion_request', 'account_deletion_cancel') NOT NULL,
  success     BOOLEAN      NOT NULL,
  ip          VARBINARY(16) NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY auth_events_user_idx (user_id, created_at),
  KEY auth_events_ip_idx (ip, created_at),
  KEY auth_events_email_idx (email_hash, created_at),
  KEY auth_events_time_idx (created_at),
  CONSTRAINT auth_events_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── files (photos; the bytes live on disk or object storage) ─────────────

-- storage = 'local' today. Moving to cloud storage later means copying the
-- objects and updating storage/storage_key; nothing else references the
-- physical location. Uploads are re-encoded to WebP by the API before a
-- row is written, so mime is normally image/webp.
CREATE TABLE files (
  id              BINARY(16)   NOT NULL,
  owner_user_id   BINARY(16)   NOT NULL,
  module_key      VARCHAR(40)  NOT NULL,                 -- which module uses it (planning, core for avatars…)
  storage         ENUM('local', 's3') NOT NULL DEFAULT 'local',
  storage_key     VARCHAR(512) NOT NULL,                 -- path / object key, never user-supplied
  original_name   VARCHAR(255) NULL,
  mime            ENUM('image/webp', 'image/jpeg', 'image/png') NOT NULL,
  size_bytes      INT UNSIGNED NOT NULL,
  width           SMALLINT UNSIGNED NULL,
  height          SMALLINT UNSIGNED NULL,
  sha256          BINARY(32)   NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3)  NULL,                     -- physical file removed by a cleanup job
  PRIMARY KEY (id),
  UNIQUE KEY files_location_uq (storage, storage_key),
  KEY files_owner_idx (owner_user_id, module_key),
  KEY files_deleted_idx (deleted_at),
  CONSTRAINT files_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT files_size_ck CHECK (size_bytes BETWEEN 1 AND 3145728)   -- 3 MB
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── profile & settings ───────────────────────────────────────────────────

CREATE TABLE profiles (
  user_id            BINARY(16)   NOT NULL,
  first_name         VARCHAR(60)  NOT NULL DEFAULT '',
  last_name          VARCHAR(60)  NOT NULL DEFAULT '',
  username           VARCHAR(30)  NULL,                  -- NULL until chosen; lowercase
  public_id          CHAR(8)      NOT NULL,              -- shown in the app and invite links, e.g. DANI8523
  phone              VARCHAR(16)  NULL,                  -- E.164, e.g. +989121234567
  phone_verified_at  DATETIME(3)  NULL,
  gender             ENUM('female', 'male') NULL,
  birth_date         DATE         NULL,
  avatar_file_id     BINARY(16)   NULL,
  version            INT UNSIGNED NOT NULL DEFAULT 1,
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  UNIQUE KEY profiles_username_uq (username),
  UNIQUE KEY profiles_public_id_uq (public_id),
  UNIQUE KEY profiles_phone_uq (phone),
  CONSTRAINT profiles_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT profiles_avatar_fk FOREIGN KEY (avatar_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT profiles_username_ck CHECK (username IS NULL OR REGEXP_LIKE(username, '^[a-z0-9_.]{3,30}$', 'c')),
  CONSTRAINT profiles_public_id_ck CHECK (REGEXP_LIKE(public_id, '^[A-Z0-9]{8}$', 'c')),
  CONSTRAINT profiles_phone_ck CHECK (phone IS NULL OR REGEXP_LIKE(phone, '^\\+[1-9][0-9]{6,14}$')),
  CONSTRAINT profiles_birth_ck CHECK (birth_date IS NULL OR birth_date >= '1900-01-01')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_settings (
  user_id                   BINARY(16)  NOT NULL,
  language                  ENUM('fa', 'en') NOT NULL DEFAULT 'fa',
  timezone                  VARCHAR(64) NOT NULL DEFAULT 'Asia/Tehran',   -- IANA name; validated by the API
  calendar_primary          ENUM('jalali', 'gregorian', 'hijri') NOT NULL DEFAULT 'jalali',
  calendars_enabled         SET('jalali', 'gregorian', 'hijri') NOT NULL DEFAULT 'jalali,gregorian,hijri',
  week_start                ENUM('saturday', 'sunday', 'monday') NOT NULL DEFAULT 'saturday',
  theme                     ENUM('system', 'dark', 'light') NOT NULL DEFAULT 'system',
  notifications_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  show_add_menu_labels      BOOLEAN     NOT NULL DEFAULT TRUE,
  discoverable_by_username  BOOLEAN     NOT NULL DEFAULT TRUE,
  discoverable_by_phone     BOOLEAN     NOT NULL DEFAULT FALSE,
  onboarding_completed_at   DATETIME(3) NULL,
  version                   INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT user_settings_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_settings_primary_ck CHECK (FIND_IN_SET(calendar_primary, calendars_enabled) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── modules (desktops and toggleable features) ──────────────────────────

-- The registry that makes the app extensible: a new desktop is a new row
-- here plus its own database/<module>/ folder. database_name is NULL for
-- modules without their own data (e.g. occasions, which reads a static
-- JSON file).
CREATE TABLE modules (
  `key`            VARCHAR(40)  NOT NULL,
  kind             ENUM('desktop', 'feature') NOT NULL,
  name_fa          VARCHAR(80)  NOT NULL,
  name_en          VARCHAR(80)  NOT NULL,
  description_fa   VARCHAR(255) NOT NULL DEFAULT '',
  description_en   VARCHAR(255) NOT NULL DEFAULT '',
  database_name    VARCHAR(64)  NULL,
  eligibility      ENUM('everyone', 'gender_female') NOT NULL DEFAULT 'everyone',
  default_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,     -- FALSE hides it from everyone
  sort_order       SMALLINT     NOT NULL DEFAULT 0,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`),
  CONSTRAINT modules_key_ck CHECK (REGEXP_LIKE(`key`, '^[a-z][a-z0-9_]{1,39}$', 'c'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Turning a desktop off keeps its data; data_purged_at records that the
-- user explicitly deleted that module's data.
CREATE TABLE user_modules (
  user_id         BINARY(16)  NOT NULL,
  module_key      VARCHAR(40) NOT NULL,
  enabled         BOOLEAN     NOT NULL,
  position        SMALLINT    NOT NULL DEFAULT 0,
  enabled_at      DATETIME(3) NULL,
  disabled_at     DATETIME(3) NULL,
  data_purged_at  DATETIME(3) NULL,
  version         INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, module_key),
  KEY user_modules_module_idx (module_key),
  CONSTRAINT user_modules_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_modules_module_fk FOREIGN KEY (module_key) REFERENCES modules (`key`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── account deletion across databases ────────────────────────────────────

-- Databases are separate, so deleting a user cannot cascade into
-- toojibee_planning etc. When the 30-day grace period ends, the purge job
-- writes one row per module, calls that module's purge(user_id) and marks
-- it done; the users row is deleted last. Re-running is safe. No FK to
-- users on purpose: these rows must outlive the user row.
CREATE TABLE user_purge_tasks (
  user_id      BINARY(16)  NOT NULL,
  module_key   VARCHAR(40) NOT NULL,
  status       ENUM('pending', 'done', 'failed') NOT NULL DEFAULT 'pending',
  attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error   VARCHAR(500) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, module_key),
  KEY user_purge_status_idx (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── admin: roles, editable content, audit ────────────────────────────────

CREATE TABLE roles (
  `key`        VARCHAR(40)  NOT NULL,
  name_fa      VARCHAR(80)  NOT NULL,
  name_en      VARCHAR(80)  NOT NULL,
  description  VARCHAR(255) NOT NULL DEFAULT '',
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE permissions (
  `key`        VARCHAR(60)  NOT NULL,                    -- e.g. content.edit
  description  VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE role_permissions (
  role_key        VARCHAR(40) NOT NULL,
  permission_key  VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_key, permission_key),
  KEY role_permissions_perm_idx (permission_key),
  CONSTRAINT role_permissions_role_fk FOREIGN KEY (role_key) REFERENCES roles (`key`) ON DELETE CASCADE,
  CONSTRAINT role_permissions_perm_fk FOREIGN KEY (permission_key) REFERENCES permissions (`key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_roles (
  user_id     BINARY(16)  NOT NULL,
  role_key    VARCHAR(40) NOT NULL,
  granted_by  BINARY(16)  NULL,
  granted_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_key),
  KEY user_roles_role_idx (role_key),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_fk FOREIGN KEY (role_key) REFERENCES roles (`key`) ON DELETE CASCADE,
  CONSTRAINT user_roles_granted_by_fk FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Short admin-editable texts shown in the app, e.g. the About page.
CREATE TABLE app_content (
  content_key  VARCHAR(60)  NOT NULL,                   -- about, …
  lang         ENUM('fa', 'en') NOT NULL,
  body         MEDIUMTEXT   NOT NULL,
  updated_by   BINARY(16)   NULL,
  version      INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (content_key, lang),
  CONSTRAINT app_content_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Privacy policy and terms, versioned. Published versions are never
-- edited; a change is a new version, and users are asked to accept it.
CREATE TABLE legal_documents (
  id            BINARY(16)   NOT NULL,
  doc_type      ENUM('privacy', 'terms') NOT NULL,
  version       SMALLINT UNSIGNED NOT NULL,
  lang          ENUM('fa', 'en') NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body          MEDIUMTEXT   NOT NULL,
  published_at  DATETIME(3)  NULL,                       -- NULL = draft
  created_by    BINARY(16)   NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY legal_documents_version_uq (doc_type, version, lang),
  CONSTRAINT legal_documents_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_consents (
  user_id      BINARY(16)   NOT NULL,
  doc_type     ENUM('privacy', 'terms') NOT NULL,
  version      SMALLINT UNSIGNED NOT NULL,
  accepted_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip           VARBINARY(16) NULL,
  PRIMARY KEY (user_id, doc_type, version),
  CONSTRAINT user_consents_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Append-only record of every admin action.
CREATE TABLE admin_audit_log (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id  BINARY(16)   NULL,
  action         VARCHAR(60)  NOT NULL,                  -- e.g. content.update, user.suspend
  target_type    VARCHAR(40)  NOT NULL,
  target_id      VARCHAR(64)  NOT NULL,
  details        JSON         NULL,                      -- before/after of what changed
  ip             VARBINARY(16) NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY admin_audit_admin_idx (admin_user_id, created_at),
  KEY admin_audit_target_idx (target_type, target_id),
  CONSTRAINT admin_audit_admin_fk FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Android releases offered on the landing site's download page.
CREATE TABLE app_releases (
  id             BINARY(16)   NOT NULL,
  platform       ENUM('android') NOT NULL,
  version_name   VARCHAR(20)  NOT NULL,                  -- 1.2.0
  version_code   INT UNSIGNED NOT NULL,                  -- monotonically increasing build number
  download_url   VARCHAR(500) NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL,
  sha256         BINARY(32)   NOT NULL,
  min_os         VARCHAR(20)  NULL,
  changelog_fa   TEXT         NULL,
  changelog_en   TEXT         NULL,
  published_at   DATETIME(3)  NULL,                      -- NULL = not yet public
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY app_releases_code_uq (platform, version_code),
  KEY app_releases_published_idx (platform, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── outgoing email ───────────────────────────────────────────────────────

-- Emails are queued here and sent by a worker with retries. payload holds
-- what the template needs (including the one-time link); the worker sets
-- it to NULL once the email is sent, so links do not stay in the database.
CREATE TABLE email_outbox (
  id               BINARY(16)   NOT NULL,
  user_id          BINARY(16)   NULL,
  to_email         VARCHAR(254) NOT NULL,
  template         ENUM('verify_email', 'reset_password', 'change_email', 'account_deletion_scheduled', 'account_deleted') NOT NULL,
  lang             ENUM('fa', 'en') NOT NULL,
  payload          JSON         NULL,
  status           ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  attempts         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error       VARCHAR(500) NULL,
  sent_at          DATETIME(3)  NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY email_outbox_queue_idx (status, next_attempt_at),
  CONSTRAINT email_outbox_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
