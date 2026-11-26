import uuid

from apps.common.testing import ApiTestCase


class PastEventTests(ApiTestCase):
    def test_past_event_create_update_and_sync(self):
        client = self.register()
        event_id = str(uuid.uuid4())
        url = f"/api/v1/planning/events/{event_id}"
        created = client.put(url, {
            "title": "Historical event", "start_date": "2001-02-20",
            "all_day": False, "start_time": "08:30", "end_time": "09:00",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        changed = client.put(url, {
            "title": "Corrected event", "start_date": "2001-02-19",
            "version": created.json()["version"],
        }, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        synced = client.get("/api/v1/planning/sync").json()["events"]
        event = next(row for row in synced if row["id"] == event_id)
        self.assertEqual(event["start_date"], "2001-02-19")
        self.assertTrue(event["start_time"].startswith("08:30"))

    def test_recurring_event_can_keep_historical_anchor(self):
        client = self.register()
        response = client.put(f"/api/v1/planning/events/{uuid.uuid4()}", {
            "title": "Annual event", "start_date": "2001-02-20",
            "rec_mode": "yearly", "rec_interval": 1,
            "rec_anchor": "2001-02-20", "rec_calendar": "gregorian",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["rec_mode"], "yearly")
        self.assertEqual(response.json()["start_date"], "2001-02-20")
