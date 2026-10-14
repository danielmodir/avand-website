from apps.common.testing import ApiTestCase
from apps.core.models import Profile


class SocialTests(ApiTestCase):
    def setUp(self):
        self.sara = self.register("sara@example.com", "Sara")
        self.ali = self.register("ali@example.com", "Ali")
        self.sara_id = self.sara.tokens["user_id"]
        self.ali_id = self.ali.tokens["user_id"]
        Profile.objects.filter(user_id=self.ali_id).update(username="ali_k", phone="+989121234567")

    def statuses(self, client):
        return {c["id"]: c["status"] for c in client.get("/api/v1/social/connections").json()}

    def test_request_and_accept(self):
        self.assertEqual(self.sara.post(f"/api/v1/social/connections/{self.ali_id}/request").status_code, 204)
        self.assertEqual(self.statuses(self.sara), {self.ali_id: "pending-outgoing"})
        self.assertEqual(self.statuses(self.ali), {self.sara_id: "pending-incoming"})
        self.ali.post(f"/api/v1/social/connections/{self.sara_id}/respond", {"accept": True}, format="json")
        self.assertEqual(self.statuses(self.sara), {self.ali_id: "accepted"})

    def test_search_is_exact_and_respects_privacy(self):
        found = self.sara.get("/api/v1/social/search", {"q": "@ali_k"}).json()
        self.assertEqual([p["id"] for p in found], [self.ali_id])
        self.assertEqual(self.sara.get("/api/v1/social/search", {"q": "ali"}).json(), [])  # no partial matches
        self.assertEqual(self.sara.get("/api/v1/social/search", {"q": "+989121234567"}).json(), [])  # phone search is opt-in

    def test_block_hides_the_blocker(self):
        self.sara.post(f"/api/v1/social/connections/{self.ali_id}/request")
        self.ali.put(f"/api/v1/social/blocks/{self.sara_id}")
        self.assertEqual(self.statuses(self.sara), {})
        self.assertEqual(self.sara.post(f"/api/v1/social/connections/{self.ali_id}/request").status_code, 404)
        self.assertEqual(self.sara.get("/api/v1/social/search", {"q": "ali_k"}).json(), [])

    def test_invite_redemption_creates_a_request(self):
        code = self.sara.post("/api/v1/social/invites").json()["code"]
        newbie = self.register("new@example.com", "Neda")
        self.assertEqual(newbie.post(f"/api/v1/social/invites/{code}/redeem").status_code, 200)
        self.assertEqual(self.statuses(self.sara), {newbie.tokens["user_id"]: "pending-incoming"})
        self.assertEqual(newbie.post(f"/api/v1/social/invites/{code}/redeem").status_code, 409)

    def test_reports(self):
        ok = self.sara.post("/api/v1/social/reports", {"user_id": self.ali_id, "reason": "spam"}, format="json")
        self.assertEqual(ok.status_code, 202)
        self_report = self.sara.post("/api/v1/social/reports", {"user_id": self.sara_id, "reason": "spam"}, format="json")
        self.assertEqual(self_report.status_code, 400)
