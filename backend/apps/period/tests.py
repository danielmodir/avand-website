import uuid

from apps.common.testing import ApiTestCase
from apps.period.models import PeriodCycle, PeriodProfile, PeriodUserKey
from apps.period.services import purge_user


class PeriodTests(ApiTestCase):
    def setUp(self):
        self.client = self.register(gender="female")  # fixed at sign-up

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

    def test_desk_switch_and_last_start_stay_saved(self):
        saved = self.client.put("/api/v1/period/profile", {"enabled": True, "last_start": "2026-10-05", "quiz_step": 4, "version": 0}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        again = self.client.get("/api/v1/period/profile").json()
        self.assertEqual((again["enabled"], again["last_start"], again["quiz_step"]), (True, "2026-10-05", 4))
        # A later save that only changes another field keeps the switch on.
        self.client.put("/api/v1/period/profile", {"show_on_calendar": True, "version": again["version"]}, format="json")
        self.assertTrue(self.client.get("/api/v1/period/profile").json()["enabled"])

    def test_setup_popup_answers_are_saved(self):
        body = {"regular": "no", "pain": "moderate", "remind_days": 2, "version": 0}
        self.assertEqual(self.client.put("/api/v1/period/profile", body, format="json").status_code, 200)
        got = self.client.get("/api/v1/period/profile").json()
        self.assertEqual((got["regular"], got["pain"], got["remind_days"]), ("no", "moderate", 2))
        bad = self.client.put("/api/v1/period/profile", {"remind_days": 9, "version": got["version"]}, format="json")
        self.assertEqual(bad.status_code, 400)

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
