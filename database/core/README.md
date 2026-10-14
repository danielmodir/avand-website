# toojibee_core

Shared by every module. Tables: `users`, `oauth_accounts`, `sessions`, `auth_tokens`, `auth_events`, `files`, `profiles`, `user_settings`, `modules`, `user_modules`, `user_purge_tasks`, `roles`, `permissions`, `role_permissions`, `user_roles`, `app_content`, `legal_documents`, `user_consents`, `admin_audit_log`, `app_releases`, `email_outbox`.

- `001_core_schema.sql`: tables
- `002_core_reference_data.sql`: modules, roles/permissions, About placeholders
- `seeds/dev_001_test_account.sql`: dev@toojibee.test (super_admin)
