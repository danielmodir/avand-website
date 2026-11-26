import uuid

from apps.common.testing import ApiTestCase


class HabitGoalTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()

    def test_goal_round_trip_and_validation(self):
        habit_id = str(uuid.uuid4())
        url = f"/api/v1/planning/habits/{habit_id}"
        created = self.client.put(url, {
            "title": "Exercise", "start_date": "2026-11-01",
            "goal": {"period": "weekly", "target": 3},
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["goal"], {"period": "weekly", "target": 3})
        synced = self.client.get("/api/v1/planning/sync").json()
        self.assertEqual(synced["habits"][0]["goal"], {"period": "weekly", "target": 3})
        bad = self.client.put(url, {"goal": {"period": "weekly", "target": 0}, "version": 1}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_legacy_habit_has_no_explicit_goal(self):
        created = self.client.put(f"/api/v1/planning/habits/{uuid.uuid4()}", {
            "title": "Read", "start_date": "2026-11-01",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertIsNone(created.json()["goal"])
