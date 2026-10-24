import time
from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.utils import timezone

from apps.common.testing import ApiTestCase

from .models import PushSubscription, ScheduledPush

ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123"
P256DH = "B" + "A" * 86  # shape only: these tests never encrypt
AUTH = "AAAAAAAAAAAAAAAAAAAAAA"


def item(slot, minutes_from_now, title="Reminder"):
    return {"slot": slot, "at": (time.time() + minutes_from_now * 60) * 1000, "title": title, "body": "Task · 09:00",
            "kind": "task", "id": "t1", "date": "2026-10-21"}


class PushTests(ApiTestCase):
    def setUp(self):
        self.sara = self.register("sara@example.com", "Sara")
        self.sara_id = self.sara.tokens["user_id"]

    def subscribe(self, client, endpoint=ENDPOINT):
        return client.post("/api/v1/notifications/subscriptions", {
            "platform": "web", "provider": "webpush", "token": endpoint, "web_p256dh": P256DH, "web_auth": AUTH,
        }, format="json")

    def schedule(self, items):
        return self.sara.put("/api/v1/notifications/schedule", {"items": items}, format="json")

    def test_push_key_is_public(self):
        key = self.client.get("/api/v1/notifications/push-key").json()["public_key"]
        self.assertEqual(len(key), 87)  # 65 raw bytes, base64url

    def test_subscription_only_to_real_push_services(self):
        self.assertEqual(self.subscribe(self.sara).status_code, 201)
        self.assertEqual(self.subscribe(self.sara, "https://evil.example.com/x").status_code, 400)
        self.assertEqual(self.subscribe(self.sara, "http://fcm.googleapis.com/x").status_code, 400)
        self.assertEqual(PushSubscription.objects.filter(user_id=self.sara_id).count(), 1)

    def test_schedule_replaces_unsent_and_never_resends(self):
        self.assertEqual(self.schedule([item("a", 5), item("b", 10)]).json()["scheduled"], 2)
        ScheduledPush.objects.filter(slot="a").update(sent_at=timezone.now())
        # "a" was sent: sending the list again doesn't queue it twice; "b" is replaced, "c" added.
        self.assertEqual(self.schedule([item("a", 5), item("b", 10, "New"), item("c", 20)]).json()["scheduled"], 2)
        rows = {r.slot: r for r in ScheduledPush.objects.filter(user_id=self.sara_id)}
        self.assertEqual(set(rows), {"a", "b", "c"})
        self.assertEqual(rows["b"].title, "New")

    def test_schedule_drops_stale_and_far_future(self):
        self.assertEqual(self.schedule([item("old", -120), item("far", 60 * 24 * 10), item("ok", 1)]).json()["scheduled"], 1)

    def test_sender_sends_due_once_and_revokes_gone_subscriptions(self):
        self.subscribe(self.sara)
        self.schedule([item("due", -1), item("later", 30)])
        with mock.patch("apps.notifications.webpush.send", return_value=201) as send:
            call_command("send_push", verbosity=0)
            call_command("send_push", verbosity=0)  # a second run sends nothing new
        self.assertEqual(send.call_count, 1)
        message = send.call_args[0][1]
        self.assertEqual((message["tag"], message["data"]["kind"]), ("due", "task"))

        ScheduledPush.objects.filter(slot="later").update(due_at=timezone.now() - timedelta(seconds=5))
        with mock.patch("apps.notifications.webpush.send", return_value=410):
            call_command("send_push", verbosity=0)
        self.assertIsNotNone(PushSubscription.objects.get(user_id=self.sara_id).revoked_at)

    def test_sender_skips_reminders_long_overdue(self):
        self.subscribe(self.sara)
        self.schedule([item("x", 1)])
        ScheduledPush.objects.filter(slot="x").update(due_at=timezone.now() - timedelta(hours=2))
        with mock.patch("apps.notifications.webpush.send", return_value=201) as send:
            call_command("send_push", verbosity=0)
        send.assert_not_called()

    def test_vapid_signing_works(self):
        from py_vapid import Vapid
        from .webpush import vapid_keys
        pem, public = vapid_keys()
        headers = Vapid.from_pem(pem.encode()).sign({"sub": "mailto:support@toojibee.ir", "aud": "https://fcm.googleapis.com"})
        self.assertIn("vapid t=", headers["Authorization"])


class NoticeTests(ApiTestCase):
    def setUp(self):
        self.sara = self.register("sara@example.com", "Sara")
        self.ali = self.register("ali@example.com", "Ali")

    def test_team_message_reaches_its_users_and_is_marked_seen(self):
        from .models import Notice
        from .notices import send_notice
        import uuid
        n = Notice.objects.create(title="Hello", body="A new feature is here.")
        count = send_notice(n, [uuid.UUID(self.sara.tokens["user_id"])], push=False)
        self.assertEqual(count, 1)
        mine = self.sara.get("/api/v1/me/notices").json()
        self.assertEqual([(m["title"], m["seen"]) for m in mine], [("Hello", False)])
        self.assertEqual(self.ali.get("/api/v1/me/notices").json(), [])
        self.assertEqual(self.sara.post("/api/v1/me/notices/seen", {"ids": [mine[0]["id"]]}, format="json").status_code, 200)
        self.assertTrue(self.sara.get("/api/v1/me/notices").json()[0]["seen"])

    def test_app_schedule_does_not_drop_a_team_push(self):
        from .models import Notice
        from .notices import send_notice
        import uuid
        uid = uuid.UUID(self.sara.tokens["user_id"])
        PushSubscription.objects.create(user_id=uid, platform="web", provider="webpush", token=ENDPOINT, token_hash="h" * 64,
                                        web_p256dh=P256DH, web_auth=AUTH)
        n = Notice.objects.create(title="Hi", body="Body")
        send_notice(n, [uid])
        self.sara.put("/api/v1/notifications/schedule", {"items": []}, format="json")
        self.assertTrue(ScheduledPush.objects.filter(user_id=uid, slot__startswith="notice|").exists())