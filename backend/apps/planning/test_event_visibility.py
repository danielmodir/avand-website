"""An event stays one record while each desk has its own visibility flag."""
import uuid

from apps.common.testing import ApiTestCase


class EventVisibilityTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()

    def test_defaults_and_independent_update_survive_sync(self):
        event_id = str(uuid.uuid4())
        path = f"/api/v1/planning/events/{event_id}"
        created = self.client.put(path, {"title": "Visit", "start_date": "2026-11-17"}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertIs(created.json()["show_in_planning"], True)
        self.assertIs(created.json()["show_in_occasions"], True)

        changed = self.client.put(path, {"version": created.json()["version"],
                                         "show_in_planning": False}, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertIs(changed.json()["show_in_planning"], False)
        self.assertIs(changed.json()["show_in_occasions"], True)
        synced = self.client.get("/api/v1/planning/sync").json()["events"]
        self.assertEqual(len(synced), 1)
        self.assertIs(synced[0]["show_in_planning"], False)
        self.assertIs(synced[0]["show_in_occasions"], True)
