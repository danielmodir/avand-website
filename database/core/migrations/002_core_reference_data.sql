-- =============================================================================
-- toojibee_core — 002: reference data
-- =============================================================================
-- Rows the application cannot run without. Written as upserts so a later
-- migration can change a name or description by re-stating the row.
-- =============================================================================

SET NAMES utf8mb4;

-- ── modules ──────────────────────────────────────────────────────────────
INSERT INTO modules
  (`key`, kind, name_fa, name_en, description_fa, description_en, database_name, eligibility, default_enabled, is_active, sort_order)
VALUES
  ('occasions',     'desktop', 'مناسبت‌ها',   'Occasions',     'مناسبت‌ها و تعطیلات روز',        'Today''s occasions and holidays', NULL,                     'everyone',      TRUE,  TRUE,  10),
  ('planning',      'desktop', 'برنامه‌ریزی', 'Planning',      'کارها، عادت‌ها و رویدادها',      'Tasks, habits and events',        'toojibee_planning',      'everyone',      TRUE,  TRUE,  20),
  ('period',        'desktop', 'پریود',        'Period',        'پیگیری و پیش‌بینی دوره',          'Cycle tracking and prediction',   'toojibee_period',        'gender_female', FALSE, TRUE,  30),
  ('social',        'feature', 'ارتباط‌ها',    'Connections',   'دوستان و دعوت',                   'Friends and invites',             'toojibee_social',        'everyone',      TRUE,  TRUE,  40),
  ('notifications', 'feature', 'اعلان‌ها',     'Notifications', 'یادآورها روی گوشی و مرورگر',     'Reminders on phone and browser',  'toojibee_notifications', 'everyone',      TRUE,  FALSE, 50)
AS new
ON DUPLICATE KEY UPDATE
  kind = new.kind, name_fa = new.name_fa, name_en = new.name_en,
  description_fa = new.description_fa, description_en = new.description_en,
  database_name = new.database_name, eligibility = new.eligibility,
  default_enabled = new.default_enabled, sort_order = new.sort_order;
-- is_active is deliberately not overwritten: an admin may have switched a
-- module off in production.

-- ── permissions & roles ──────────────────────────────────────────────────
INSERT INTO permissions (`key`, description) VALUES
  ('content.edit',     'Edit About text and other app content'),
  ('legal.publish',    'Draft and publish privacy policy / terms versions'),
  ('users.view',       'Look up user accounts'),
  ('users.suspend',    'Suspend and reactivate accounts'),
  ('reports.review',   'Review abuse reports'),
  ('modules.manage',   'Turn modules on or off for everyone'),
  ('releases.manage',  'Publish Android releases on the download page'),
  ('roles.manage',     'Grant and revoke admin roles'),
  ('audit.view',       'Read the admin audit log')
AS new
ON DUPLICATE KEY UPDATE description = new.description;

INSERT INTO roles (`key`, name_fa, name_en, description) VALUES
  ('super_admin',    'مدیر کل',      'Super admin',    'Every permission'),
  ('content_editor', 'ویرایشگر محتوا', 'Content editor', 'App texts, legal documents and releases'),
  ('moderator',      'ناظر',          'Moderator',      'Abuse reports and account suspension')
AS new
ON DUPLICATE KEY UPDATE name_fa = new.name_fa, name_en = new.name_en, description = new.description;

INSERT IGNORE INTO role_permissions (role_key, permission_key)
SELECT 'super_admin', `key` FROM permissions;

INSERT IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('content_editor', 'content.edit'),
  ('content_editor', 'legal.publish'),
  ('content_editor', 'releases.manage'),
  ('moderator',      'users.view'),
  ('moderator',      'users.suspend'),
  ('moderator',      'reports.review');

-- ── app content placeholders ─────────────────────────────────────────────
-- Empty About text means "use the app's built-in default", as today.
INSERT IGNORE INTO app_content (content_key, lang, body) VALUES
  ('about', 'fa', ''),
  ('about', 'en', '');
