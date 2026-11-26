"""Manual event address and meeting URL survive create, edit and sync."""
import uuid

from apps.common.testing import ApiTestCase


class EventLocationTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()

    def test_location_and_meeting_url_round_trip(self):
        path = f"/api/v1/planning/events/{uuid.uuid4()}"
        created = self.client.put(path, {
            "title": "Visit", "start_date": "2026-11-18",
            "location": "Street 12", "meeting_url": "https://meet.example.org/a",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["location"], "Street 12")
        self.assertEqual(created.json()["meeting_url"], "https://meet.example.org/a")
        changed = self.client.put(path, {"version": created.json()["version"], "location": "Office"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(changed.json()["meeting_url"], "https://meet.example.org/a")
        synced = self.client.get("/api/v1/planning/sync").json()["events"][0]
        self.assertEqual((synced["location"], synced["meeting_url"]), ("Office", "https://meet.example.org/a"))

    def test_non_web_meeting_link_is_rejected(self):
        for url in ("javascript:alert(1)", "ftp://files.example.org/meeting"):
            with self.subTest(url=url):
                path = f"/api/v1/planning/events/{uuid.uuid4()}"
                bad = self.client.put(path, {
                    "title": "Visit", "start_date": "2026-11-18", "meeting_url": url}, format="json")
                self.assertEqual(bad.status_code, 400)
