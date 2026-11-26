from django.test import SimpleTestCase

from .models import UserSettings
from .serializers import SettingsSerializer
from apps.common.testing import ApiTestCase


class OccasionReminderSettingsTests(SimpleTestCase):
    def test_valid_plans_round_trip_as_preferences(self):
        key = "jalali:1:1:%D9%86%D9%88%D8%B1%D9%88%D8%B2"
        plans = {key: [{"id": "morning", "days_before": 7, "time": "09:30", "enabled": True}]}
        serializer = SettingsSerializer(UserSettings(), data={"preferences": {"occasion_reminders": plans}}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["preferences"]["occasion_reminders"], plans)

    def test_rejects_unsafe_or_invalid_plans(self):
        key = "jalali:1:1:%D9%86%D9%88%D8%B1%D9%88%D8%B2"
        for plans in (
            {key: [{"id": "a", "days_before": -1, "time": "09:30", "enabled": True}]},
            {key: [{"id": "a", "days_before": 7, "time": "25:00", "enabled": True}]},
            {key: [{"id": "a", "days_before": 7, "time": "09:30", "enabled": "yes"}]},
            {"bad|key": [{"id": "a", "days_before": 7, "time": "09:30", "enabled": True}]},
        ):
            serializer = SettingsSerializer(UserSettings(), data={"preferences": {"occasion_reminders": plans}}, partial=True)
            self.assertFalse(serializer.is_valid(), plans)


class OccasionReminderApiTests(ApiTestCase):
    def test_plans_persist_and_can_be_cleared_without_changing_other_preferences(self):
        client = self.register()
        first = client.get("/api/v1/me/settings").json()
        self.assertEqual(first["preferences"]["occasion_reminders"], {})
        key = "jalali:1:1:%D9%86%D9%88%D8%B1%D9%88%D8%B2"
        plans = {key: [{"id": "morning", "days_before": 7, "time": "09:30", "enabled": True}]}
        saved = client.patch("/api/v1/me/settings", {
            "preferences": {"occasion_reminders": plans}, "version": first["version"]}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        self.assertEqual(client.get("/api/v1/me/settings").json()["preferences"]["occasion_reminders"], plans)
        cleared = client.patch("/api/v1/me/settings", {
            "preferences": {"occasion_reminders": {}}, "version": saved.json()["version"]}, format="json")
        self.assertEqual(cleared.status_code, 200, cleared.content)
        self.assertEqual(cleared.json()["preferences"]["occasion_reminders"], {})
        self.assertTrue(cleared.json()["preferences"]["occasions_jalali"])
