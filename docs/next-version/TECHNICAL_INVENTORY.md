# Technical inventory — source snapshot

Snapshot: 2026-11-15, baseline 927f48a. Generated from local source and Django metadata, without database queries. This is not a production schema or live endpoint check.

## Runtime and dependency declarations

- Installed local Django: 5.2.18
- Installed local djangorestframework: 3.16.1
- Installed local cryptography: 50.0.2
- Installed local google-auth: 2.62.0
- Installed local PyJWT: 2.15.1
- Installed local pywebpush: 2.5.0

Declared ranges: backend/requirements.txt. PHP documented minimum 7.4; PHP CLI unavailable on PATH during audit. Android minSdk 24 / compileSdk and targetSdk 34 / version 1.4.0 (5).

## Django routes

Prefix /api/v1 for application endpoints; /health and configured admin root are separate. Methods below are implemented view handlers; framework OPTIONS/HEAD may additionally apply. Admin-generated routes omitted; see core/admin.py and other apps/*/admin.py.

| Path | Methods | Handler |
|---|---|---|
| `/health` | function; see source | config.urls.health |
| `/api/v1/auth/providers` | GET | apps.core.views.AuthProvidersView |
| `/api/v1/auth/register` | POST | apps.core.views.RegisterView |
| `/api/v1/auth/login` | POST | apps.core.views.LoginView |
| `/api/v1/auth/google` | POST | apps.core.views.GoogleLoginView |
| `/api/v1/auth/google/start` | GET | apps.core.views.GoogleStartView |
| `/api/v1/auth/google/callback` | GET | apps.core.views.GoogleCallbackView |
| `/api/v1/auth/google/exchange` | POST | apps.core.views.GoogleExchangeView |
| `/api/v1/auth/refresh` | POST | apps.core.views.RefreshView |
| `/api/v1/auth/logout` | POST | apps.core.views.LogoutView |
| `/api/v1/auth/logout-all` | POST | apps.core.views.LogoutAllView |
| `/api/v1/auth/sessions` | GET | apps.core.views.SessionListView |
| `/api/v1/auth/sessions/<uuid:session_id>` | DELETE | apps.core.views.SessionDetailView |
| `/api/v1/auth/email/verify` | POST | apps.core.views.VerifyEmailView |
| `/api/v1/auth/email/code` | POST | apps.core.views.EmailCodeView |
| `/api/v1/auth/email/code/resend` | POST | apps.core.views.EmailCodeResendView |
| `/api/v1/support/messages` | GET, POST | apps.core.views.SupportMessagesView |
| `/api/v1/support/unread` | GET | apps.core.views.SupportUnreadView |
| `/api/v1/auth/password/code` | POST | apps.core.views.PasswordCodeView |
| `/api/v1/auth/password/forgot` | POST | apps.core.views.PasswordForgotView |
| `/api/v1/auth/password/reset` | POST | apps.core.views.PasswordResetView |
| `/api/v1/auth/password/change` | POST | apps.core.views.PasswordChangeView |
| `/api/v1/auth/account/deletion` | POST | apps.core.views.AccountDeletionView |
| `/api/v1/me` | GET | apps.core.views.MeView |
| `/api/v1/me/profile` | GET, PATCH | apps.core.views.ProfileView |
| `/api/v1/me/profile/username-available` | GET | apps.core.views.UsernameAvailableView |
| `/api/v1/me/avatar` | POST, DELETE | apps.core.views.AvatarView |
| `/api/v1/me/settings` | GET, PATCH | apps.core.views.SettingsView |
| `/api/v1/me/modules` | GET | apps.core.views.ModuleListView |
| `/api/v1/me/modules/<slug:key>` | PATCH | apps.core.views.ModuleDetailView |
| `/api/v1/me/modules/<slug:key>/purge` | POST | apps.core.views.ModulePurgeView |
| `/api/v1/me/consents` | POST | apps.core.views.ConsentView |
| `/api/v1/me/mcp` | GET, POST, DELETE | apps.core.mcp.McpLinkView |
| `/api/v1/mcp` | GET, POST, DELETE | apps.core.mcp.McpView |
| `/api/v1/mcp/u/<str:key>` | GET, POST, DELETE | apps.core.mcp.McpView |
| `/api/v1/files` | POST | apps.core.views.FileUploadView |
| `/api/v1/files/<uuid:file_id>` | GET, DELETE | apps.core.views.FileDetailView |
| `/api/v1/content/<slug:key>` | GET | apps.core.views.ContentView |
| `/api/v1/legal/<slug:doc_type>` | GET | apps.core.views.LegalDocumentView |
| `/api/v1/releases/<slug:platform>/latest` | GET | apps.core.views.LatestReleaseView |
| `/api/v1/calendar/occasions` | GET | apps.calendar_data.views.OccasionsView |
| `/api/v1/calendar/hijri-months` | GET | apps.calendar_data.views.HijriMonthsView |
| `/api/v1/calendar/day` | GET | apps.calendar_data.views.DayView |
| `/api/v1/planning/sync` | GET | apps.planning.views.SyncView |
| `/api/v1/planning/tasks/<uuid:task_id>/occurrences/<str:day>` | PUT | apps.planning.views.TaskOccurrenceView |
| `/api/v1/planning/tasks/<uuid:task_id>/attachments/<uuid:file_id>` | PUT, DELETE | apps.planning.views.AttachmentView |
| `/api/v1/planning/habits/<uuid:habit_id>/logs/<str:day>` | PUT | apps.planning.views.HabitLogView |
| `/api/v1/planning/<str:kind>/<uuid:item_id>/exceptions/<str:day>` | PUT, DELETE | apps.planning.views.ExceptionView |
| `/api/v1/planning/<str:kind>/<uuid:item_id>` | PUT, DELETE | apps.planning.views.ItemView |
| `/api/v1/period/profile` | GET, PUT | apps.period.views.ProfileView |
| `/api/v1/period/cycles` | GET | apps.period.views.CycleListView |
| `/api/v1/period/cycles/<uuid:cycle_id>` | PUT, DELETE | apps.period.views.CycleDetailView |
| `/api/v1/period/predictions` | GET | apps.period.views.PredictionsView |
| `/api/v1/social/connections` | GET | apps.social.views.ConnectionListView |
| `/api/v1/social/connections/<uuid:user_id>` | DELETE | apps.social.views.ConnectionDetailView |
| `/api/v1/social/connections/<uuid:user_id>/request` | POST | apps.social.views.RequestView |
| `/api/v1/social/connections/<uuid:user_id>/respond` | POST | apps.social.views.RespondView |
| `/api/v1/social/blocks/<uuid:user_id>` | PUT, DELETE | apps.social.views.BlockView |
| `/api/v1/social/search` | GET | apps.social.views.SearchView |
| `/api/v1/social/invites` | GET, POST | apps.social.views.InviteListView |
| `/api/v1/social/invites/<uuid:invite_id>` | DELETE | apps.social.views.InviteDetailView |
| `/api/v1/social/invites/<slug:code>/redeem` | POST | apps.social.views.RedeemInviteView |
| `/api/v1/social/reports` | POST | apps.social.views.ReportView |
| `/api/v1/groups` | GET, POST | apps.social.groups.GroupListView |
| `/api/v1/groups/join` | POST | apps.social.groups.GroupJoinView |
| `/api/v1/groups/<uuid:group_id>` | PATCH, DELETE | apps.social.groups.GroupDetailView |
| `/api/v1/groups/<uuid:group_id>/leave` | POST | apps.social.groups.GroupLeaveView |
| `/api/v1/groups/<uuid:group_id>/invite/reset` | POST | apps.social.groups.GroupInviteResetView |
| `/api/v1/groups/<uuid:group_id>/items/<str:item_id>` | PUT, DELETE | apps.social.groups.GroupItemView |
| `/api/v1/groups/<uuid:group_id>/items/<str:item_id>/marks` | PUT | apps.social.groups.GroupMarkView |
| `/api/v1/notifications/push-key` | GET | apps.notifications.views.PushKeyView |
| `/api/v1/notifications/schedule` | PUT | apps.notifications.views.ScheduleView |
| `/api/v1/notifications/subscriptions` | POST | apps.notifications.views.SubscriptionListView |
| `/api/v1/notifications/subscriptions/<uuid:sub_id>` | DELETE | apps.notifications.views.SubscriptionDetailView |
| `/api/v1/notifications/preferences` | GET, PUT | apps.notifications.views.PreferenceView |
| `/api/v1/notifications/mutes/<slug:module_key>` | PUT, DELETE | apps.notifications.views.MuteView |
| `/api/v1/me/notices` | GET | apps.notifications.views.MyNoticesView |
| `/api/v1/me/notices/seen` | POST | apps.notifications.views.MyNoticesSeenView |

## PHP routes

Prefix /api/v1. Source: backend-php/v1/index.php. Auth, ownership, role and payload checks are in the named lib handler; PHP document sync is not the same API contract as Django per-item planning writes.

| Method and path | Handler | Source line |
|---|---|---|
| GET /health | inline handler (see router) | 36 |
| POST /stats | 'tj_stats_post' | 37 |
| GET /auth/providers | inline handler (see router) | 38 |
| POST /auth/register | 'tj_register' | 39 |
| POST /auth/login | 'tj_login' | 40 |
| POST /auth/refresh | 'tj_refresh' | 41 |
| POST /auth/logout | 'tj_logout' | 42 |
| POST /auth/password/forgot | 'tj_forgot_password' | 43 |
| POST /auth/password/reset | 'tj_reset_password' | 44 |
| POST /auth/email/verify | 'tj_verify_email' | 45 |
| POST /auth/password/code | 'tj_reset_code' | 46 |
| POST /auth/email/code | 'tj_email_code' | 47 |
| POST /auth/email/code/resend | 'tj_email_code_resend' | 48 |
| GET /me | 'tj_me' | 49 |
| PATCH /me | 'tj_update_me' | 50 |
| POST /me/delete | 'tj_delete_me' | 51 |
| POST /me/heartbeat | 'tj_heartbeat' | 52 |
| POST /me/password | 'tj_change_password' | 53 |
| GET /me/profile/username-available | 'tj_username_available' | 54 |
| GET /social/search | 'tj_social_search' | 55 |
| GET /social/connections | 'tj_social_list' | 56 |
| GET /social/invite | 'tj_social_invite' | 57 |
| POST /social/invite/reset | 'tj_social_invite_reset' | 58 |
| POST /social/invite/accept | 'tj_social_invite_accept' | 59 |
| GET /groups | 'tj_groups_list' | 60 |
| POST /groups | 'tj_group_create' | 61 |
| POST /groups/join | 'tj_group_join' | 62 |
| GET /period/shares | 'tj_period_shares_get' | 63 |
| PUT /period/shares | 'tj_period_shares_put' | 64 |
| GET /period/shared-with-me | 'tj_period_shared_with_me' | 65 |
| POST /support/messages | 'tj_support_send' | 66 |
| GET /support/messages | 'tj_support_mine' | 67 |
| GET /support/unread | 'tj_support_unread' | 68 |
| GET /me/notices | 'tj_notices_mine' | 69 |
| POST /me/notices/seen | 'tj_notices_seen' | 70 |
| GET /admin/notices | 'tj_admin_notices' | 71 |
| POST /admin/notices | 'tj_admin_notice_send' | 72 |
| GET /admin/notices/preview | 'tj_admin_notice_preview' | 73 |
| GET /admin/messages | 'tj_admin_messages' | 74 |
| GET /admin/messages/canned | 'tj_admin_canned_get' | 75 |
| PUT /admin/messages/canned | 'tj_admin_canned_put' | 76 |
| GET /notifications/push-key | 'tj_push_key' | 77 |
| POST /notifications/subscriptions | 'tj_push_subscribe' | 78 |
| PUT /notifications/schedule | 'tj_push_schedule' | 79 |
| GET /me/mcp | 'tj_mcp_link_get' | 80 |
| POST /me/mcp | 'tj_mcp_link_create' | 81 |
| DELETE /me/mcp | 'tj_mcp_link_delete' | 82 |
| GET /sync | 'tj_sync_get' | 83 |
| PUT /sync | 'tj_sync_put' | 84 |
| GET /admin/state | 'tj_admin_state' | 87 |
| POST /admin/setup | 'tj_admin_setup' | 88 |
| POST /admin/login | 'tj_admin_login' | 89 |
| POST /admin/logout | 'tj_admin_logout' | 90 |
| POST /admin/invite/accept | 'tj_admin_accept_invite' | 91 |
| GET /admin/overview | 'tj_admin_overview' | 92 |
| GET /admin/audit | 'tj_admin_audit_list' | 93 |
| GET /admin/admins | 'tj_admin_list' | 94 |
| POST /admin/admins | 'tj_admin_create' | 95 |
| GET /admin/users | 'tj_admin_users' | 96 |
| GET /admin/backup | 'tj_admin_backup' | 97 |
| GET /admin/visits | 'tj_admin_visits' | 98 |
| GET /admin/stats | 'tj_admin_stats' | 99 |
| GET /admin/auth-settings | 'tj_admin_auth_settings' | 100 |
| PUT /admin/auth-settings | 'tj_admin_auth_settings_save' | 101 |
| GET /content | 'tj_public_content' | 102 |
| GET /articles/featured | 'tj_public_featured_articles' | 103 |
| GET /articles | 'tj_public_articles' | 104 |
| GET /calendar/hijri-months | 'tj_public_hijri_months' | 105 |
| GET /admin/calendar/hijri-months | 'tj_admin_hijri_months' | 106 |
| PUT /admin/calendar/hijri-months | 'tj_admin_hijri_months_save' | 107 |
| GET /admin/content | 'tj_admin_content' | 108 |
| PUT /admin/content | 'tj_admin_content_save' | 109 |
| POST /admin/content/image | 'tj_admin_content_image' | 110 |
| POST /admin/content/image/reset | 'tj_admin_content_image_reset' | 111 |
| GET /admin/articles | 'tj_admin_articles' | 112 |
| POST /admin/articles | 'tj_admin_article_create' | 113 |
| GET /admin/system | 'tj_admin_system' | 114 |
| GET /admin/system/table | 'tj_admin_system_table' | 115 |
| POST /admin/system/cleanup | 'tj_admin_system_cleanup' | 116 |
| POST /admin/system/check | 'tj_admin_system_check' | 117 |

### PHP dynamic routes

Method dispatch is checked inside each router block; below are the exact route regex and source line, not additional static endpoints.

| Pattern | Source line |
|---|---|
| <code>#^/admin/admins/([a-f0-9]{32})(/delete)?$#</code> | 122 |
| <code>#^/admin/articles/([a-f0-9]{32})(?:/(submit&#124;approve&#124;reject&#124;unpublish&#124;delete&#124;cover&#124;cover-remove))?$#</code> | 128 |
| <code>#^/admin/users/([a-f0-9]{32})(?:/(suspend&#124;signout&#124;delete))?$#</code> | 136 |
| <code>#^/social/(connections&#124;blocks)/([a-f0-9]{32})(?:/(request&#124;respond))?$#</code> | 147 |
| <code>#^/groups/([a-f0-9]{32})(?:/(leave&#124;invite/reset)&#124;/items/([A-Za-z0-9-]{8,64})(/marks)?)?$#</code> | 162 |
| <code>#^/admin/messages/([a-f0-9]{32})/(reply&#124;close&#124;reopen)$#</code> | 180 |
| <code>#^/notifications/subscriptions/([a-f0-9]{32})$#</code> | 185 |
| <code>#^/mcp/u/([A-Za-z0-9_-]{8,100})$#</code> | 191 |

Additional exact /mcp delegates to tj_mcp_handle. Public HTML routes (landing, articles, today, calendars, convert, world-clock, sitemap) are rewritten by frontend/.htaccess to PHP page handlers; they are not JSON API routes.

## Django data model and relationships

Each app is routed to its own database (core -> default; calendar_data -> calendar; others use their app name). Cross-database user/file references are UUID values, not database-enforced foreign keys. Concrete project models only; Django auth/admin/session built-ins omitted. Model fields inherited from abstract bases are included. This listing is model metadata; migration drift was separately checked.


### core

| Model / table | Fields | Relationships |
|---|---|---|
| User / core_user | password:CharField; last_login:DateTimeField?; is_superuser:BooleanField; id:UUIDField [PK]; email:CharField; email_verified_at:DateTimeField?; status:CharField; suspended_reason:CharField; deletion_requested_at:DateTimeField?; is_staff:BooleanField; created_at:DateTimeField; updated_at:DateTimeField | groups <-> auth.Group; user_permissions <-> auth.Permission |
| OAuthAccount / core_oauthaccount | id:UUIDField [PK]; user:ForeignKey; provider:CharField; provider_user_id:CharField; provider_email:CharField; created_at:DateTimeField; last_used_at:DateTimeField? | user -> core.User (CASCADE) |
| AuthSession / core_authsession | id:UUIDField [PK]; user:ForeignKey; token_hash:CharField; device_name:CharField; platform:CharField; user_agent:CharField; ip:GenericIPAddressField?; created_at:DateTimeField; last_used_at:DateTimeField; expires_at:DateTimeField; revoked_at:DateTimeField?; revoked_reason:CharField; replaced_by:ForeignKey? | user -> core.User (CASCADE); replaced_by -> core.AuthSession (SET_NULL) |
| AuthToken / core_authtoken | id:UUIDField [PK]; user:ForeignKey; purpose:CharField; token_hash:CharField; new_email:CharField; created_at:DateTimeField; expires_at:DateTimeField; used_at:DateTimeField?; attempts:PositiveSmallIntegerField | user -> core.User (CASCADE) |
| AuthEvent / core_authevent | id:BigAutoField [PK]; user:ForeignKey?; email_hash:CharField; event:CharField; success:BooleanField; ip:GenericIPAddressField?; user_agent:CharField; created_at:DateTimeField | user -> core.User (SET_NULL) |
| StoredFile / core_storedfile | id:UUIDField [PK]; owner:ForeignKey; module_key:CharField; storage:CharField; storage_key:CharField; original_name:CharField; mime:CharField; size_bytes:PositiveIntegerField; width:PositiveSmallIntegerField?; height:PositiveSmallIntegerField?; sha256:CharField; created_at:DateTimeField; deleted_at:DateTimeField? | owner -> core.User (CASCADE) |
| Profile / core_profile | user:OneToOneField [PK]; first_name:CharField; last_name:CharField; username:CharField?; public_id:CharField; phone:CharField?; phone_verified_at:DateTimeField?; gender:CharField?; birth_date:DateField?; avatar:ForeignKey?; version:PositiveIntegerField; created_at:DateTimeField; updated_at:DateTimeField | user -> core.User (CASCADE); avatar -> core.StoredFile (SET_NULL) |
| UserSettings / core_usersettings | user:OneToOneField [PK]; language:CharField; timezone:CharField; calendar_primary:CharField; calendars_enabled:CharField; week_start:CharField; theme:CharField; palette:CharField; preferences:JSONField; item_colors:JSONField; notifications_enabled:BooleanField; show_add_menu_labels:BooleanField; discoverable_by_username:BooleanField; discoverable_by_phone:BooleanField; onboarding_completed_at:DateTimeField?; version:PositiveIntegerField; updated_at:DateTimeField | user -> core.User (CASCADE) |
| Module / core_module | key:CharField [PK]; kind:CharField; name_fa:CharField; name_en:CharField; description_fa:CharField; description_en:CharField; database_alias:CharField; eligibility:CharField; default_enabled:BooleanField; is_active:BooleanField; sort_order:SmallIntegerField; created_at:DateTimeField; updated_at:DateTimeField | UUID/scalar references only |
| UserModule / core_usermodule | id:BigAutoField [PK]; user:ForeignKey; module:ForeignKey; enabled:BooleanField; position:SmallIntegerField; enabled_at:DateTimeField?; disabled_at:DateTimeField?; data_purged_at:DateTimeField?; version:PositiveIntegerField; updated_at:DateTimeField | user -> core.User (CASCADE); module -> core.Module (PROTECT) |
| UserPurgeTask / core_userpurgetask | id:BigAutoField [PK]; user_id:UUIDField; module_key:CharField; status:CharField; attempts:PositiveSmallIntegerField; last_error:CharField; created_at:DateTimeField; updated_at:DateTimeField | UUID/scalar references only |
| AppContent / core_appcontent | id:BigAutoField [PK]; content_key:CharField; lang:CharField; body:TextField; updated_by:ForeignKey?; version:PositiveIntegerField; updated_at:DateTimeField | updated_by -> core.User (SET_NULL) |
| LegalDocument / core_legaldocument | id:UUIDField [PK]; doc_type:CharField; version:PositiveSmallIntegerField; lang:CharField; title:CharField; body:TextField; published_at:DateTimeField?; created_by:ForeignKey?; created_at:DateTimeField | created_by -> core.User (SET_NULL) |
| UserConsent / core_userconsent | id:BigAutoField [PK]; user:ForeignKey; doc_type:CharField; version:PositiveSmallIntegerField; accepted_at:DateTimeField; ip:GenericIPAddressField? | user -> core.User (CASCADE) |
| AppRelease / core_apprelease | id:UUIDField [PK]; platform:CharField; version_name:CharField; version_code:PositiveIntegerField; download_url:CharField; size_bytes:PositiveBigIntegerField; sha256:CharField; min_os:CharField; changelog_fa:TextField; changelog_en:TextField; published_at:DateTimeField?; created_at:DateTimeField | UUID/scalar references only |
| EmailOutbox / core_emailoutbox | id:UUIDField [PK]; user:ForeignKey?; to_email:CharField; template:CharField; lang:CharField; payload:JSONField?; status:CharField; attempts:PositiveSmallIntegerField; next_attempt_at:DateTimeField; last_error:CharField; sent_at:DateTimeField?; created_at:DateTimeField | user -> core.User (SET_NULL) |
| SupportMessage / core_supportmessage | id:UUIDField [PK]; user:ForeignKey; kind:CharField; body:TextField; lang:CharField; app_info:CharField; status:CharField; reply:TextField; replied_at:DateTimeField?; user_seen_at:DateTimeField?; created_at:DateTimeField | user -> core.User (CASCADE) |
| McpKey / core_mcpkey | user:OneToOneField [PK]; key_hash:CharField; key_enc:BinaryField; created_at:DateTimeField; last_used_at:DateTimeField? | user -> core.User (CASCADE) |

### calendar_data

| Model / table | Fields | Relationships |
|---|---|---|
| Occasion / calendar_data_occasion | id:BigAutoField [PK]; calendar:CharField; month:PositiveSmallIntegerField; day:PositiveSmallIntegerField; title_fa:CharField; title_en:CharField; is_holiday:BooleanField; source:CharField; is_active:BooleanField; created_at:DateTimeField; updated_at:DateTimeField | UUID/scalar references only |
| HijriMonthStart / calendar_data_hijrimonthstart | id:BigAutoField [PK]; hijri_year:PositiveSmallIntegerField; hijri_month:PositiveSmallIntegerField; starts_on:DateField; is_forecast:BooleanField; note:CharField; updated_at:DateTimeField | UUID/scalar references only |

### planning

| Model / table | Fields | Relationships |
|---|---|---|
| Category / planning_category | created_at:DateTimeField; updated_at:DateTimeField; id:UUIDField [PK]; user_id:UUIDField; version:PositiveIntegerField; deleted_at:DateTimeField?; name:CharField; color:CharField; sort_order:IntegerField | UUID/scalar references only |
| Task / planning_task | created_at:DateTimeField; updated_at:DateTimeField; id:UUIDField [PK]; user_id:UUIDField; version:PositiveIntegerField; deleted_at:DateTimeField?; rec_mode:CharField; rec_interval:PositiveSmallIntegerField; rec_weekdays:PositiveSmallIntegerField; rec_until:DateField?; rec_anchor:DateField?; rec_calendar:CharField; reminder_type:CharField; reminder_time:TimeField?; reminder_every_hours:PositiveSmallIntegerField?; reminder_text:CharField; reminder_lead_minutes:PositiveIntegerField?; reminder_every_minutes:PositiveSmallIntegerField?; parent:ForeignKey?; category:ForeignKey?; title:CharField; description:TextField; pinned:BooleanField; sort_order:IntegerField; start_date:DateField; end_date:DateField?; start_time:TimeField?; end_time:TimeField?; origin_task:ForeignKey?; origin_date:DateField?; reminder_date:DateField? | parent -> planning.Task (CASCADE); category -> planning.Category (SET_NULL); origin_task -> planning.Task (SET_NULL) |
| TaskOccurrence / planning_taskoccurrence | id:BigAutoField [PK]; task:ForeignKey; occurrence_date:DateField; user_id:UUIDField; status:CharField; completed_at:DateTimeField?; version:PositiveIntegerField; updated_at:DateTimeField | task -> planning.Task (CASCADE) |
| TaskException / planning_taskexception | id:BigAutoField [PK]; task:ForeignKey; occurrence_date:DateField; user_id:UUIDField; created_at:DateTimeField; updated_at:DateTimeField; deleted_at:DateTimeField? | task -> planning.Task (CASCADE) |
| TaskAttachment / planning_taskattachment | id:BigAutoField [PK]; task:ForeignKey; file_id:UUIDField; user_id:UUIDField; sort_order:PositiveSmallIntegerField; created_at:DateTimeField; updated_at:DateTimeField; deleted_at:DateTimeField? | task -> planning.Task (CASCADE) |
| Habit / planning_habit | created_at:DateTimeField; updated_at:DateTimeField; id:UUIDField [PK]; user_id:UUIDField; version:PositiveIntegerField; deleted_at:DateTimeField?; rec_mode:CharField; rec_interval:PositiveSmallIntegerField; rec_weekdays:PositiveSmallIntegerField; rec_until:DateField?; rec_anchor:DateField?; rec_calendar:CharField; reminder_type:CharField; reminder_time:TimeField?; reminder_every_hours:PositiveSmallIntegerField?; reminder_text:CharField; reminder_lead_minutes:PositiveIntegerField?; reminder_every_minutes:PositiveSmallIntegerField?; category:ForeignKey?; title:CharField; start_date:DateField; end_date:DateField?; sort_order:IntegerField; tracker:JSONField? | category -> planning.Category (SET_NULL) |
| HabitLog / planning_habitlog | id:BigAutoField [PK]; habit:ForeignKey; log_date:DateField; user_id:UUIDField; status:CharField; value:PositiveIntegerField?; version:PositiveIntegerField; updated_at:DateTimeField | habit -> planning.Habit (CASCADE) |
| Event / planning_event | created_at:DateTimeField; updated_at:DateTimeField; id:UUIDField [PK]; user_id:UUIDField; version:PositiveIntegerField; deleted_at:DateTimeField?; rec_mode:CharField; rec_interval:PositiveSmallIntegerField; rec_weekdays:PositiveSmallIntegerField; rec_until:DateField?; rec_anchor:DateField?; rec_calendar:CharField; reminder_type:CharField; reminder_time:TimeField?; reminder_every_hours:PositiveSmallIntegerField?; reminder_text:CharField; reminder_lead_minutes:PositiveIntegerField?; reminder_every_minutes:PositiveSmallIntegerField?; category:ForeignKey?; title:CharField; description:TextField; start_date:DateField; end_date:DateField?; all_day:BooleanField; start_time:TimeField?; end_time:TimeField?; reminder_minutes_before:PositiveSmallIntegerField?; color:CharField; kind:CharField; origin_event:ForeignKey?; origin_date:DateField? | category -> planning.Category (SET_NULL); origin_event -> planning.Event (SET_NULL) |
| EventException / planning_eventexception | id:BigAutoField [PK]; event:ForeignKey; occurrence_date:DateField; user_id:UUIDField; created_at:DateTimeField; updated_at:DateTimeField; deleted_at:DateTimeField? | event -> planning.Event (CASCADE) |

### period

| Model / table | Fields | Relationships |
|---|---|---|
| PeriodUserKey / period_perioduserkey | user_id:UUIDField [PK]; wrapped_dek:BinaryField; kek_version:PositiveSmallIntegerField; created_at:DateTimeField; rotated_at:DateTimeField? | UUID/scalar references only |
| PeriodProfile / period_periodprofile | key:OneToOneField [PK]; enc_data:BinaryField; version:PositiveIntegerField; created_at:DateTimeField; updated_at:DateTimeField | key -> period.PeriodUserKey (CASCADE) |
| PeriodCycle / period_periodcycle | id:UUIDField [PK]; key:ForeignKey; enc_data:BinaryField; version:PositiveIntegerField; created_at:DateTimeField; updated_at:DateTimeField; deleted_at:DateTimeField? | key -> period.PeriodUserKey (CASCADE) |

### social

| Model / table | Fields | Relationships |
|---|---|---|
| Connection / social_connection | id:BigAutoField [PK]; user_a:UUIDField; user_b:UUIDField; status:CharField; requested_by:UUIDField; created_at:DateTimeField; updated_at:DateTimeField; responded_at:DateTimeField? | UUID/scalar references only |
| Invite / social_invite | id:UUIDField [PK]; inviter_user_id:UUIDField; code:CharField; max_uses:PositiveSmallIntegerField?; uses:PositiveSmallIntegerField; expires_at:DateTimeField?; revoked_at:DateTimeField?; created_at:DateTimeField | UUID/scalar references only |
| InviteRedemption / social_inviteredemption | id:BigAutoField [PK]; invite:ForeignKey; invitee_user_id:UUIDField; redeemed_at:DateTimeField | invite -> social.Invite (CASCADE) |
| Report / social_report | id:UUIDField [PK]; reporter_user_id:UUIDField; reported_user_id:UUIDField; reason:CharField; details:CharField; status:CharField; reviewed_by:UUIDField?; reviewed_at:DateTimeField?; resolution_note:CharField; created_at:DateTimeField; updated_at:DateTimeField | UUID/scalar references only |
| Group / social_group | id:UUIDField [PK]; name:CharField; owner_user_id:UUIDField; invite_token:CharField; created_at:DateTimeField; updated_at:DateTimeField | UUID/scalar references only |
| GroupMember / social_groupmember | id:BigAutoField [PK]; group:ForeignKey; user_id:UUIDField; color:CharField; role:CharField; joined_at:DateTimeField | group -> social.Group (CASCADE) |
| GroupItem / social_groupitem | id:BigAutoField [PK]; group:ForeignKey; item_id:CharField; kind:CharField; data:JSONField; done_mode:CharField; created_by:UUIDField?; created_at:DateTimeField; updated_at:DateTimeField | group -> social.Group (CASCADE) |
| GroupMark / social_groupmark | id:BigAutoField [PK]; item:ForeignKey; user_id:UUIDField; key:CharField; status:CharField; updated_at:DateTimeField | item -> social.GroupItem (CASCADE) |

### notifications

| Model / table | Fields | Relationships |
|---|---|---|
| PushSubscription / notifications_pushsubscription | id:UUIDField [PK]; user_id:UUIDField; platform:CharField; provider:CharField; token:TextField; token_hash:CharField; web_p256dh:CharField; web_auth:CharField; device_name:CharField; created_at:DateTimeField; last_seen_at:DateTimeField; revoked_at:DateTimeField? | UUID/scalar references only |
| NotificationPreference / notifications_notificationpreference | user_id:UUIDField [PK]; quiet_start:TimeField?; quiet_end:TimeField?; updated_at:DateTimeField | UUID/scalar references only |
| NotificationMute / notifications_notificationmute | id:BigAutoField [PK]; user_id:UUIDField; module_key:CharField; created_at:DateTimeField | UUID/scalar references only |
| ScheduledPush / notifications_scheduledpush | id:BigAutoField [PK]; user_id:UUIDField; slot:CharField; due_at:DateTimeField; title:CharField; body:CharField; data:JSONField; sent_at:DateTimeField? | UUID/scalar references only |
| NotificationLog / notifications_notificationlog | id:BigAutoField [PK]; user_id:UUIDField; source_module:CharField; source_type:CharField; source_id:UUIDField; occurrence_date:DateField?; scheduled_for:DateTimeField; status:CharField; attempts:PositiveSmallIntegerField; sent_at:DateTimeField?; error:CharField; created_at:DateTimeField | UUID/scalar references only |
| Notice / notifications_notice | id:UUIDField [PK]; title:CharField; body:TextField; audience:CharField; recipients:PositiveIntegerField; created_by:UUIDField?; created_at:DateTimeField | UUID/scalar references only |
| NoticeRecipient / notifications_noticerecipient | id:BigAutoField [PK]; notice:ForeignKey; user_id:UUIDField; seen_at:DateTimeField? | notice -> notifications.Notice (CASCADE) |

Concrete project model count: 47.

### Migration leaf nodes (disk graph)

- calendar_data: 0002_load_data
- core: 0009_mcp_key
- notifications: 0003_notices
- period: 0001_initial
- planning: 0008_event_color
- social: 0003_group_admins

## PHP tables and relationships

One database selected by config: PDO SQLite fallback or MySQL. Actual production engine is unverified. bootstrap.php applies schema versions 1..24 during initialization. Planning/profile/settings/period are in tj_user_data JSON (period encrypted), not separate task/habit/event tables.

| Table | Source line | Declared foreign keys |
|---|---|---|
| tj_schema | 116 | none declared in CREATE block |
| tj_content | 150 | none declared in CREATE block |
| tj_articles | 160 | none declared in CREATE block |
| tj_hijri_months | 190 | none declared in CREATE block |
| tj_connections | 204 | requester_id -> tj_users.id [CASCADE]; addressee_id -> tj_users.id [CASCADE] |
| tj_blocks | 216 | blocker_id -> tj_users.id [CASCADE]; blocked_id -> tj_users.id [CASCADE] |
| tj_period_shares | 240 | owner_id -> tj_users.id [CASCADE]; viewer_id -> tj_users.id [CASCADE] |
| tj_push_subs | 254 | user_id -> tj_users.id [CASCADE] |
| tj_push_queue | 269 | user_id -> tj_users.id [CASCADE] |
| tj_messages | 293 | user_id -> tj_users.id [CASCADE] |
| tj_notices | 353 | none declared in CREATE block |
| tj_notice_recipients | 364 | notice_id -> tj_notices.id [CASCADE]; user_id -> tj_users.id [CASCADE] |
| tj_article_old_slugs | 378 | article_id -> tj_articles.id [CASCADE] |
| tj_groups | 419 | owner_id -> tj_users.id [CASCADE] |
| tj_group_members | 429 | group_id -> tj_groups.id [CASCADE]; user_id -> tj_users.id [CASCADE] |
| tj_group_items | 438 | group_id -> tj_groups.id [CASCADE]; created_by -> tj_users.id [SET NULL] |
| tj_group_marks | 451 | item_id -> tj_group_items.id [CASCADE]; user_id -> tj_users.id [CASCADE] |
| tj_mcp_keys | 473 | user_id -> tj_users.id [CASCADE] |
| tj_admins | 535 | none declared in CREATE block |
| tj_admin_sessions | 551 | admin_id -> tj_admins.id [CASCADE] |
| tj_admin_audit | 563 | none declared in CREATE block |
| tj_users | 600 | none declared in CREATE block |
| tj_sessions | 611 | user_id -> tj_users.id [CASCADE] |
| tj_tokens | 624 | user_id -> tj_users.id [CASCADE] |
| tj_user_data | 634 | user_id -> tj_users.id [CASCADE] |
| tj_attempts | 641 | none declared in CREATE block |

### High-level data relationships

- tj_users -> tj_sessions, tj_tokens, tj_user_data, connections/blocks, period_shares, push subscriptions/queue, messages, notice recipients, group membership/marks and MCP keys.
- tj_groups -> tj_group_members and tj_group_items; tj_group_items -> tj_group_marks.
- tj_admins -> tj_admin_sessions; article author/reviewer and audit context are also represented in schema; review the exact migration for nullable references and retention behavior.
- tj_articles -> tj_article_old_slugs; categories and publication workflow are article fields.
- tj_hijri_months, tj_content and schema/attempt records support reference data/content/runtime.
- New billing/finance/university/gym/conversation/SEO-report tables do not exist in this snapshot. Their schemas require the decisions in DECISIONS.md.

## Frontend page and component inventory

Static page shells (not generated public PHP routes):

- frontend/404.html
- frontend/demo/index.html
- frontend/en/about/index.html
- frontend/en/contact/index.html
- frontend/en/download/index.html
- frontend/en/guide/index.html
- frontend/en/index.html
- frontend/en/privacy/index.html
- frontend/en/terms/index.html
- frontend/fa/about/index.html
- frontend/fa/contact/index.html
- frontend/fa/download/index.html
- frontend/fa/guide/index.html
- frontend/fa/index.html
- frontend/fa/privacy/index.html
- frontend/fa/terms/index.html
- frontend/googlee9ee861bf30edf34.html
- frontend/index.html

App components:

- app-error: app-error.css, app-error.html, app-error.js
- articles: articles.css, articles.js
- auth: auth.css, auth.js
- banner: banner.css, banner.html
- birthday: birthday.css, birthday.js
- calendar: back-today.html, calendar-gestures.js, calendar.css, calendar.js
- contact: contact.css, contact.js
- date-picker: date-picker.css, date-picker.js
- day-sheet: day-sheet.css, day-sheet.html, day-sheet.js
- groups: groups.css, groups.js
- items: items.css, items.js, swipe.js
- menu: menu-overlay.html, menu.css, menu.js
- notices: notices.css, notices.js
- period: period-quiz.html, period.css, period.js
- popup: popup.css, popup.html, popup.js
- toolbar: fab-menu.html, toolbar.css, toolbar.html
- tour: tour.css, tour.js
- workspace: workspace.css, workspace.js

Core JS modules:

- android.js
- back-nav.js
- backup.js
- calendars.js
- challenge.js
- compat.js
- date-tools.js
- dates.js
- dropdown.js
- events.js
- features.js
- groups.js
- i18n.js
- icons.js
- include.js
- local-store.js
- notify.js
- occasions.js
- onboarding.js
- prayer.js
- render.js
- search.js
- share-card.js
- state.js
- stats.js
- templates.js
- trackers.js
- util.js

Native classes:

- AppWeb.kt
- MainActivity.kt
- Ongoing.kt
- PhoneActions.kt
- Reminders.kt
- ShareFiles.kt
- WebFiles.kt
- Widgets.kt

No secrets, user rows, private account records or config values are included in this inventory.
