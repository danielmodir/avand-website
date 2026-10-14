import re
from datetime import timedelta

from django.db import connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.testing import PASSWORD, ApiTestCase
from apps.core.models import AuthSession, EmailOutbox, User
from apps.core.services.purge import purge_due_accounts
from apps.planning.models import Task


class DatabaseRoutingTests(ApiTestCase):
    def test_each_app_lives_only_in_its_own_database(self):
        tables = {alias: set(connections[alias].introspection.table_names()) for alias in connections}
        self.assertIn("core_user", tables["default"])
        self.assertIn("planning_task", tables["planning"])
        self.assertIn("period_periodcycle", tables["period"])
        self.assertIn("social_connection", tables["social"])
        self.assertIn("calendar_data_occasion", tables["calendar"])
        self.assertNotIn("core_user", tables["planning"])
        self.assertNotIn("planning_task", tables["default"])
        self.assertNotIn("period_periodcycle", tables["planning"])


class AuthFlowTests(ApiTestCase):
    def test_register_provisions_profile_settings_and_default_desktops(self):
        client = self.register()
        me = client.get("/api/v1/me").json()
        self.assertRegex(me["profile"]["public_id"], r"^SARA\d{4}$")
        self.assertEqual(me["settings"]["calendar_primary"], "jalali")
        self.assertEqual([m["key"] for m in me["modules"]], ["occasions", "planning", "social"])
        self.assertTrue(EmailOutbox.objects.filter(template="verify_email").exists())

    def test_duplicate_email_and_weak_password_are_rejected(self):
        self.register()
        again = APIClient().post("/api/v1/auth/register", {"email": "USER@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(again.status_code, 409)
        weak = APIClient().post("/api/v1/auth/register", {"email": "b@example.com", "password": "12345678"}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.assertEqual(weak.json()["error"], "weak_password")

    def test_login_failure_does_not_reveal_whether_the_email_exists(self):
        self.register()
        wrong_pw = APIClient().post("/api/v1/auth/login", {"email": "user@example.com", "password": "nope-nope-1"}, format="json")
        no_user = APIClient().post("/api/v1/auth/login", {"email": "ghost@example.com", "password": "nope-nope-1"}, format="json")
        self.assertEqual(wrong_pw.status_code, 401)
        self.assertEqual(wrong_pw.json(), no_user.json())

    def test_refresh_rotates_and_replay_signs_out_everywhere(self):
        client = self.register()
        old_refresh = client.tokens["refresh_token"]
        rotated = APIClient().post("/api/v1/auth/refresh", {"refresh_token": old_refresh}, format="json")
        self.assertEqual(rotated.status_code, 200)
        new = rotated.json()
        self.assertNotEqual(new["refresh_token"], old_refresh)

        replay = APIClient().post("/api/v1/auth/refresh", {"refresh_token": old_refresh}, format="json")
        self.assertEqual(replay.status_code, 401)
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {new['access_token']}")
        self.assertEqual(fresh.get("/api/v1/me").status_code, 401)  # whole chain revoked
        self.assertTrue(AuthSession.objects.filter(revoked_reason="reuse_detected").exists())

    def test_logout_invalidates_the_access_token_immediately(self):
        client = self.register()
        self.assertEqual(client.post("/api/v1/auth/logout").status_code, 204)
        self.assertEqual(client.get("/api/v1/me").status_code, 401)

    def test_password_reset_flow(self):
        client = self.register()
        APIClient().post("/api/v1/auth/password/forgot", {"email": "user@example.com"}, format="json")
        mail = EmailOutbox.objects.filter(template="reset_password").latest("created_at")
        token = re.search(r"reset-password=(.+)$", mail.payload["link"]).group(1)
        done = APIClient().post("/api/v1/auth/password/reset", {"token": token, "password": "New-pass-9876"}, format="json")
        self.assertEqual(done.status_code, 204)
        self.assertEqual(client.get("/api/v1/me").status_code, 401)  # old sessions revoked
        reuse = APIClient().post("/api/v1/auth/password/reset", {"token": token, "password": "Other-pass-9876"}, format="json")
        self.assertEqual(reuse.status_code, 400)  # single use
        login = APIClient().post("/api/v1/auth/login", {"email": "user@example.com", "password": "New-pass-9876"}, format="json")
        self.assertEqual(login.status_code, 200)

    def test_unknown_email_reset_request_looks_identical(self):
        response = APIClient().post("/api/v1/auth/password/forgot", {"email": "ghost@example.com"}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(EmailOutbox.objects.exists())


class ProfileAndSettingsTests(ApiTestCase):
    def test_stale_version_is_rejected_with_the_current_row(self):
        client = self.register()
        settings = client.get("/api/v1/me/settings").json()
        ok = client.patch("/api/v1/me/settings", {"theme": "dark", "version": settings["version"]}, format="json")
        self.assertEqual(ok.status_code, 200)
        stale = client.patch("/api/v1/me/settings", {"theme": "light", "version": settings["version"]}, format="json")
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["current"]["theme"], "dark")

    def test_primary_calendar_must_be_enabled_and_timezone_valid(self):
        client = self.register()
        v = client.get("/api/v1/me/settings").json()["version"]
        bad = client.patch("/api/v1/me/settings", {"calendars_enabled": ["gregorian"], "version": v}, format="json")
        self.assertEqual(bad.status_code, 400)
        bad_tz = client.patch("/api/v1/me/settings", {"timezone": "Mars/Base", "version": v}, format="json")
        self.assertEqual(bad_tz.status_code, 400)

    def test_period_desktop_only_appears_for_eligible_profiles(self):
        client = self.register()
        self.set_gender(client, "female")
        enabled = client.patch("/api/v1/me/modules/period", {"enabled": True}, format="json")
        self.assertEqual(enabled.status_code, 200)
        self.assertIn("period", [m["key"] for m in client.get("/api/v1/me/modules").json()])
        other = self.register("m@example.com", "Ali")
        self.set_gender(other, "male")
        self.assertEqual(other.patch("/api/v1/me/modules/period", {"enabled": True}, format="json").status_code, 404)


class AccountDeletionTests(ApiTestCase):
    def test_deletion_signs_out_then_purges_every_database_after_grace(self):
        client = self.register()
        task_id = "0192f3a0-0c00-7000-8000-000000000101"
        client.put(f"/api/v1/planning/tasks/{task_id}", {"title": "t", "start_date": "2026-10-15"}, format="json")
        self.assertEqual(client.post("/api/v1/auth/account/deletion").status_code, 202)
        self.assertEqual(client.get("/api/v1/me").status_code, 401)

        user = User.objects.get(email="user@example.com")
        self.assertEqual(purge_due_accounts(), 0)  # still inside the grace period
        User.objects.filter(pk=user.pk).update(deletion_requested_at=timezone.now() - timedelta(days=31))
        self.assertEqual(purge_due_accounts(), 1)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
        self.assertFalse(Task.objects.filter(user_id=user.pk).exists())

    def test_signing_in_during_grace_period_cancels_deletion(self):
        client = self.register()
        client.post("/api/v1/auth/account/deletion")
        login = APIClient().post("/api/v1/auth/login", {"email": "user@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(User.objects.get(email="user@example.com").status, "active")
