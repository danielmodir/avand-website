import uuid

from apps.common.testing import ApiTestCase
from apps.period.models import PeriodCycle, PeriodProfile, PeriodUserKey
from apps.period.services import purge_user


class PeriodTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()
        self.set_gender(self.client, "female")

    def test_only_available_to_eligible_profiles(self):
        other = self.register("m@example.com", "Ali")
        self.assertEqual(other.get("/api/v1/period/profile").status_code, 403)

    def test_profile_is_stored_encrypted(self):
        saved = self.client.put("/api/v1/period/profile", {"cycle_length": 31, "period_length": 5, "version": 0}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        self.assertEqual(self.client.get("/api/v1/period/profile").json()["cycle_length"], 31)
        blob = bytes(PeriodProfile.objects.get().enc_data)
        # Long plaintext markers only: a 2-byte one like b"31" shows up in
        # random ciphertext now and then and made this test flaky.
        self.assertNotIn(b"cycle_length", blob)
        self.assertNotIn(b'"period_length": 5', blob)

    def test_ciphertext_moved_to_another_row_does_not_decrypt(self):
        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        self.client.put(f"/api/v1/period/cycles/{a}", {"start_date": "2026-09-01"}, format="json")
        self.client.put(f"/api/v1/period/cycles/{b}", {"start_date": "2026-10-01"}, format="json")
        PeriodCycle.objects.filter(pk=b).update(enc_data=PeriodCycle.objects.get(pk=a).enc_data)
        with self.assertRaises(Exception):
            self.client.get("/api/v1/period/cycles")

    def test_predictions_from_history(self):
        for start in ("2026-07-01", "2026-07-30", "2026-08-28", "2026-09-26"):
            self.client.put(f"/api/v1/period/cycles/{uuid.uuid4()}", {"start_date": start}, format="json")
        pred = self.client.get("/api/v1/period/predictions").json()
        self.assertEqual(pred["basis"], "history")
        self.assertEqual(pred["cycle_length"], 29)
        self.assertEqual(pred["next"][0]["start_date"], "2026-10-25")

    def test_purge_shreds_the_key_and_the_data(self):
        self.client.put(f"/api/v1/period/cycles/{uuid.uuid4()}", {"start_date": "2026-09-01"}, format="json")
        user_id = PeriodUserKey.objects.get().user_id
        purge_user(user_id)
        self.assertFalse(PeriodUserKey.objects.exists())
        self.assertFalse(PeriodCycle.objects.exists())
