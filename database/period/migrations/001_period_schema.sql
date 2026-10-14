-- =============================================================================
-- toojibee_period — 001: schema (health data, encrypted)
-- =============================================================================
-- Nothing in this database is readable without the server's master key.
--
-- Envelope encryption:
--   * every user gets a random 256-bit data key (DEK) on first use
--   * the DEK is stored only wrapped (AES-256-GCM) with the master key
--     (KEK); the KEK lives outside MySQL (environment / secret store),
--     identified by kek_version so it can be rotated
--   * every enc_* value is AES-256-GCM with the user's DEK:
--       12-byte nonce || ciphertext || 16-byte tag
--     with "<table>:<row id>:<user id>" as associated data, so a
--     ciphertext copied into another row or another user fails to decrypt
--
-- Deleting a user's period_user_keys row makes all of their period data
-- permanently unreadable, including copies in old backups
-- (crypto-shredding). The purge job deletes it first, then the rows.
--
-- user_id refers to toojibee_core.users.id (separate database, no FK).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE period_user_keys (
  user_id      BINARY(16)        NOT NULL,
  wrapped_dek  VARBINARY(128)    NOT NULL,     -- nonce + encrypted 32-byte DEK + tag
  kek_version  SMALLINT UNSIGNED NOT NULL,
  created_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  rotated_at   DATETIME(3)       NULL,
  PRIMARY KEY (user_id),
  KEY period_user_keys_kek_idx (kek_version)     -- find rows still wrapped with an old KEK
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Encrypted JSON: { cycleLength, periodLength, quizStep, showOnCalendar }
CREATE TABLE period_profiles (
  user_id     BINARY(16)     NOT NULL,
  enc_data    VARBINARY(1024) NOT NULL,
  version     INT UNSIGNED   NOT NULL DEFAULT 1,
  created_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT period_profiles_key_fk FOREIGN KEY (user_id) REFERENCES period_user_keys (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per logged cycle. Encrypted JSON: { startDate, endDate }.
-- Dates are encrypted, so ordering happens in the API after decryption
-- (a user has at most a few hundred rows).
CREATE TABLE period_cycles (
  id          BINARY(16)     NOT NULL,
  user_id     BINARY(16)     NOT NULL,
  enc_data    VARBINARY(512) NOT NULL,
  version     INT UNSIGNED   NOT NULL DEFAULT 1,
  created_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)    NULL,
  PRIMARY KEY (id),
  KEY period_cycles_sync_idx (user_id, updated_at),
  CONSTRAINT period_cycles_key_fk FOREIGN KEY (user_id) REFERENCES period_user_keys (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
