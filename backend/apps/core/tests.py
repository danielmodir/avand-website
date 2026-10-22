import re
from datetime import timedelta
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.test import override_settings

from django.db import connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.testing import PASSWORD, ApiTestCase
from apps.core.models import AuthSession, EmailOutbox, User
from apps.core.services.purge import purge_due_accounts
from apps.planning.models import Task


class ErrorPageTests(ApiTestCase):
    def test_api_errors_are_json_and_pages_are_themed_html(self):
        api = APIClient().get("/api/v1/no-such-endpoint")
        self.assertEqual(api.status_code, 404)
        self.assertEqual(api.json(), {"error": "not_found"})
        page = APIClient().get("/no-such-page")
        self.assertEqual(page.status_code, 404)
        self.assertIn("text/html", page["Content-Type"])
        self.assertIn("این صفحه پیدا نشد", page.content.decode())

    def test_server_error_handler(self):
        from django.test import RequestFactory

        from config import urls

        api = urls.handler500(RequestFactory().get("/api/v1/x"))
        self.assertEqual((api.status_code, api.content), (500, b'{"error": "server_error"}'))
        page = urls.handler500(RequestFactory().get("/admin/x"))
        self.assertEqual(page.status_code, 500)
        self.assertIn("یه مشکل از سمت ما پیش اومد", page.content.decode())


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
        self.assertRegex(me["profile"]["public_id"], r"^[0-9A-HJKMNP-TV-Z]{8}$")
        self.assertEqual(User.objects.get(email="user@example.com").id.version, 4)  # random, not time-ordered
        self.assertEqual(me["settings"]["calendar_primary"], "jalali")
        self.assertEqual([m["key"] for m in me["modules"]], ["occasions", "planning", "social", "notifications"])
        self.assertTrue(EmailOutbox.objects.filter(template="verify_email").exists())

    def test_duplicate_email_and_weak_password_are_rejected(self):
        self.register()
        rest = {"username": "another", "gender": "male", "birth_date": "1990-01-01"}
        again = APIClient().post("/api/v1/auth/register", {"email": "USER@example.com", "password": PASSWORD, **rest}, format="json")
        self.assertEqual(again.status_code, 409)
        weak = APIClient().post("/api/v1/auth/register", {"email": "b@example.com", "password": "12345678", **rest}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.assertEqual(weak.json()["error"], "weak_password")

    def test_signup_requires_username_gender_and_an_age_of_nine(self):
        from datetime import date

        def attempt(**over):
            body = {"email": "c@example.com", "password": PASSWORD, "username": "sara_95", "gender": "female", "birth_date": "1995-05-20", **over}
            return APIClient().post("/api/v1/auth/register", body, format="json")

        for missing in ("username", "gender", "birth_date"):
            body = {"email": "c@example.com", "password": PASSWORD, "username": "sara_95", "gender": "female", "birth_date": "1995-05-20"}
            del body[missing]
            self.assertEqual(APIClient().post("/api/v1/auth/register", body, format="json").status_code, 400, missing)
        self.assertEqual(attempt(username="sara 95").status_code, 400)
        self.assertEqual(attempt(username="سارا").status_code, 400)
        self.assertEqual(attempt(gender="other").status_code, 400)
        self.assertEqual(attempt(birth_date=date.today().replace(year=date.today().year - 8).isoformat()).status_code, 400)
        letters_only = attempt(password="abcdefghij")
        self.assertEqual(letters_only.json()["error"], "weak_password")
        ok = attempt(username="Sara_95")
        self.assertEqual(ok.status_code, 201, ok.content)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {ok.json()['access_token']}")
        profile = client.get("/api/v1/me").json()["profile"]
        self.assertEqual((profile["username"], profile["gender"], profile["birth_date"]), ("sara_95", "female", "1995-05-20"))
        taken = attempt(email="d@example.com", username="SARA_95")
        self.assertEqual((taken.status_code, taken.json()["error"]), (409, "username_taken"))

    def test_gender_and_birth_date_are_fixed_after_sign_up(self):
        client = self.register()
        version = client.get("/api/v1/me/profile").json()["version"]
        changed = client.patch("/api/v1/me/profile", {"gender": "female", "version": version}, format="json")
        self.assertEqual(changed.status_code, 400)
        changed = client.patch("/api/v1/me/profile", {"birth_date": "2001-01-01", "version": version}, format="json")
        self.assertEqual(changed.status_code, 400)
        same = client.patch("/api/v1/me/profile", {"gender": "male", "birth_date": "1995-05-20", "first_name": "Sam", "version": version}, format="json")
        self.assertEqual(same.status_code, 200, same.content)
        bad_username = client.patch("/api/v1/me/profile", {"username": "with space", "version": same.json()["version"]}, format="json")
        self.assertEqual(bad_username.status_code, 400)

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
        code = mail.payload["code"]
        wrong = APIClient().post("/api/v1/auth/password/code", {"email": "user@example.com", "code": "000000" if code != "000000" else "111111"}, format="json")
        self.assertEqual(wrong.json()["error"], "invalid_code")
        # Persian digits are fine.
        fa_code = code.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
        token = APIClient().post("/api/v1/auth/password/code", {"email": "user@example.com", "code": fa_code}, format="json").json()["token"]
        again = APIClient().post("/api/v1/auth/password/code", {"email": "user@example.com", "code": code}, format="json")
        self.assertEqual(again.json()["error"], "code_expired")  # a code works once
        done = APIClient().post("/api/v1/auth/password/reset", {"token": token, "password": "New-pass-9876"}, format="json")
        self.assertEqual(done.status_code, 204)
        self.assertEqual(client.get("/api/v1/me").status_code, 401)  # old sessions revoked
        reuse = APIClient().post("/api/v1/auth/password/reset", {"token": token, "password": "Other-pass-9876"}, format="json")
        self.assertEqual(reuse.status_code, 400)  # single use
        login = APIClient().post("/api/v1/auth/login", {"email": "user@example.com", "password": "New-pass-9876"}, format="json")
        self.assertEqual(login.status_code, 200)

    def test_reset_code_dies_after_five_wrong_tries(self):
        self.register()
        APIClient().post("/api/v1/auth/password/forgot", {"email": "user@example.com"}, format="json")
        code = EmailOutbox.objects.filter(template="reset_password").latest("created_at").payload["code"]
        bad = "123456" if code != "123456" else "654321"
        errors = [APIClient().post("/api/v1/auth/password/code", {"email": "user@example.com", "code": bad}, format="json").json()["error"] for _ in range(5)]
        self.assertEqual(errors, ["invalid_code"] * 4 + ["code_expired"])
        right = APIClient().post("/api/v1/auth/password/code", {"email": "user@example.com", "code": code}, format="json")
        self.assertEqual(right.json()["error"], "code_expired")

    def test_signup_email_code(self):
        client = self.register()
        me = client.get("/api/v1/me").json()["profile"]
        self.assertEqual((me["email_verified"], me["verify_required"]), (False, True))
        code = EmailOutbox.objects.filter(template="verify_email").latest("created_at").payload["code"]
        self.assertEqual(client.post("/api/v1/auth/email/verify-code", {"code": code}, format="json").status_code, 204)
        me = client.get("/api/v1/me").json()["profile"]
        self.assertEqual((me["email_verified"], me["verify_required"]), (True, False))

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

    def test_palette_and_preferences_merge_and_validate(self):
        client = self.register()
        first = client.get("/api/v1/me/settings").json()
        self.assertEqual(first["palette"], "toojibee")
        self.assertTrue(first["preferences"]["planning_day_summary"])  # defaults are filled in
        ok = client.patch("/api/v1/me/settings", {"palette": "classic", "preferences": {"occasions_hijri": False}, "version": first["version"]}, format="json")
        self.assertEqual(ok.status_code, 200)
        ok2 = client.patch("/api/v1/me/settings", {"preferences": {"planning_day_summary": False}, "version": ok.json()["version"]}, format="json")
        prefs = ok2.json()["preferences"]
        self.assertFalse(prefs["occasions_hijri"])  # the earlier switch is kept
        self.assertFalse(prefs["planning_day_summary"])
        self.assertEqual(ok2.json()["palette"], "classic")
        v = ok2.json()["version"]
        self.assertEqual(client.patch("/api/v1/me/settings", {"preferences": {"nope": True}, "version": v}, format="json").status_code, 400)
        self.assertEqual(client.patch("/api/v1/me/settings", {"preferences": {"occasions_hijri": "no"}, "version": v}, format="json").status_code, 400)
        self.assertEqual(client.patch("/api/v1/me/settings", {"palette": "neon", "version": v}, format="json").status_code, 400)

    def test_period_desktop_only_appears_for_eligible_profiles(self):
        client = self.register(gender="female")
        enabled = client.patch("/api/v1/me/modules/period", {"enabled": True}, format="json")
        self.assertEqual(enabled.status_code, 200)
        self.assertIn("period", [m["key"] for m in client.get("/api/v1/me/modules").json()])
        other = self.register("m@example.com", "Ali", gender="male")
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


@override_settings(GOOGLE_WEB_CLIENT_ID="web-client", GOOGLE_WEB_CLIENT_SECRET="secret",
                   GOOGLE_REDIRECT_URI="https://api.example/api/v1/auth/google/callback",
                   CORS_ALLOWED_ORIGINS=["http://localhost:8080"])
class GoogleRedirectFlowTests(ApiTestCase):
    def test_start_callback_exchange(self):
        start = APIClient().get("/api/v1/auth/google/start", {"next": "http://localhost:8080/demo/"})
        self.assertEqual(start.status_code, 302)
        query = parse_qs(urlparse(start["Location"]).query)
        self.assertEqual(query["client_id"], ["web-client"])

        claims = {"sub": "g-123", "email": "g@example.com", "email_verified": True, "given_name": "Gol", "nonce": "x"}
        with mock.patch("apps.core.google_oauth.claims_from_code", return_value=claims):
            back = APIClient().get("/api/v1/auth/google/callback", {"code": "c", "state": query["state"][0]})
        self.assertEqual(back.status_code, 302)
        location = back["Location"]
        self.assertTrue(location.startswith("http://localhost:8080/demo/#login_code="))
        self.assertNotIn("access_token", location)  # tokens never travel in the URL

        code = location.split("login_code=")[1]
        tokens = APIClient().post("/api/v1/auth/google/exchange", {"code": code}, format="json")
        self.assertEqual(tokens.status_code, 200)
        self.assertIn("refresh_token", tokens.json())
        again = APIClient().post("/api/v1/auth/google/exchange", {"code": code}, format="json")
        self.assertEqual(again.status_code, 401)  # one-time code
        self.assertTrue(User.objects.filter(email="g@example.com", email_verified_at__isnull=False).exists())

    def test_rejects_foreign_redirect_and_tampered_state(self):
        evil = APIClient().get("/api/v1/auth/google/start", {"next": "https://evil.example/"})
        self.assertEqual(evil.status_code, 400)
        tampered = APIClient().get("/api/v1/auth/google/callback", {"code": "c", "state": "forged"})
        self.assertEqual(tampered.status_code, 400)


class FileTests(ApiTestCase):
    def test_upload_reencodes_and_only_the_owner_can_read(self):
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (64, 48), "orange").save(buf, format="PNG")
        buf.seek(0)
        buf.name = "photo.png"
        owner = self.register()
        uploaded = owner.post("/api/v1/files", {"file": buf, "module": "planning"}, format="multipart")
        self.assertEqual(uploaded.status_code, 201, uploaded.content)
        file_id = uploaded.json()["id"]

        got = owner.get(f"/api/v1/files/{file_id}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got["Content-Type"], "image/webp")
        self.assertIn("no-store", got["Cache-Control"])
        self.assertEqual(APIClient().get(f"/api/v1/files/{file_id}").status_code, 401)
        other = self.register("other@example.com", "Ali")
        self.assertEqual(other.get(f"/api/v1/files/{file_id}").status_code, 404)

    def test_non_images_are_rejected(self):
        import io

        fake = io.BytesIO(b"<script>alert(1)</script>")
        fake.name = "x.png"
        client = self.register()
        self.assertEqual(client.post("/api/v1/files", {"file": fake}, format="multipart").status_code, 400)
