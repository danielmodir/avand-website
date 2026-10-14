-- =============================================================================
-- toojibee_social — 001: schema
-- =============================================================================
-- Connections (friends), invite links and abuse reports.
-- All user ids refer to toojibee_core.users.id (separate database, no FK).
-- Sharing items between friends, if it comes, will be a new `shares`
-- table here; nothing below needs to change for it.
-- =============================================================================

SET NAMES utf8mb4;

-- One row per pair of users, stored with user_a < user_b so a pair can
-- never appear twice. requested_by is who sent the request, or who
-- blocked. Only the API writes this table, inside a transaction that
-- locks the pair's row (see backend/src/modules/social).
CREATE TABLE connections (
  user_a        BINARY(16)  NOT NULL,
  user_b        BINARY(16)  NOT NULL,
  status        ENUM('pending', 'accepted', 'blocked') NOT NULL,
  requested_by  BINARY(16)  NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  responded_at  DATETIME(3) NULL,
  PRIMARY KEY (user_a, user_b),
  KEY connections_user_b_idx (user_b, status),
  KEY connections_user_a_idx (user_a, status),
  CONSTRAINT connections_order_ck CHECK (user_a < user_b),
  CONSTRAINT connections_requester_ck CHECK (requested_by = user_a OR requested_by = user_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Invite links: toojibee.ir/invite/<code>. Codes are random, not derived
-- from the user's public id, so a link can be revoked and replaced.
CREATE TABLE invites (
  id               BINARY(16)  NOT NULL,
  inviter_user_id  BINARY(16)  NOT NULL,
  code             CHAR(10)    NOT NULL,
  max_uses         SMALLINT UNSIGNED NULL,               -- NULL = unlimited
  uses             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at       DATETIME(3) NULL,
  revoked_at       DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY invites_code_uq (code),
  KEY invites_inviter_idx (inviter_user_id),
  CONSTRAINT invites_code_ck CHECK (REGEXP_LIKE(code, '^[A-Za-z0-9]{10}$', 'c')),
  CONSTRAINT invites_uses_ck CHECK (max_uses IS NULL OR uses <= max_uses)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Who signed up through which invite. A user can be invited only once.
CREATE TABLE invite_redemptions (
  invite_id        BINARY(16)  NOT NULL,
  invitee_user_id  BINARY(16)  NOT NULL,
  redeemed_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (invite_id, invitee_user_id),
  UNIQUE KEY invite_redemptions_invitee_uq (invitee_user_id),
  CONSTRAINT invite_redemptions_invite_fk FOREIGN KEY (invite_id) REFERENCES invites (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Abuse reports, reviewed by admins with the reports.review permission.
CREATE TABLE reports (
  id                BINARY(16)    NOT NULL,
  reporter_user_id  BINARY(16)    NOT NULL,
  reported_user_id  BINARY(16)    NOT NULL,
  reason            ENUM('spam', 'harassment', 'impersonation', 'inappropriate', 'other') NOT NULL,
  details           VARCHAR(1000) NULL,
  status            ENUM('open', 'reviewing', 'actioned', 'dismissed') NOT NULL DEFAULT 'open',
  reviewed_by       BINARY(16)    NULL,
  reviewed_at       DATETIME(3)   NULL,
  resolution_note   VARCHAR(1000) NULL,
  created_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY reports_queue_idx (status, created_at),
  KEY reports_reported_idx (reported_user_id),
  KEY reports_reporter_idx (reporter_user_id, created_at),   -- rate-limit reports per reporter
  CONSTRAINT reports_self_ck CHECK (reporter_user_id <> reported_user_id),
  CONSTRAINT reports_review_ck CHECK (status IN ('open') OR reviewed_by IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
