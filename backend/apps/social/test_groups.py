from apps.common.testing import ApiTestCase


class GroupTests(ApiTestCase):
    def setUp(self):
        self.sara = self.register("sara@example.com", "Sara")
        self.ali = self.register("ali@example.com", "Ali")
        self.neda = self.register("neda@example.com", "Neda")
        self.ids = {c: c.tokens["user_id"] for c in (self.sara, self.ali, self.neda)}
        self.sara.post(f"/api/v1/social/connections/{self.ids[self.ali]}/request")
        self.ali.post(f"/api/v1/social/connections/{self.ids[self.sara]}/respond", {"accept": True}, format="json")

    def create(self, members=None):
        r = self.sara.post("/api/v1/groups", {"name": "Family", "color": "#3e63dd", "members": members or [self.ids[self.ali]]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["created"], r.json()

    def test_create_with_friends_and_own_colors(self):
        gid, body = self.create()
        group = body["groups"][0]
        self.assertTrue(group["owner"])
        self.assertEqual(group["color"], "#3E63DD")
        self.assertEqual(len(group["members"]), 2)
        self.ali.patch(f"/api/v1/groups/{gid}", {"color": "#E5484D"}, format="json")
        self.assertEqual(self.ali.get("/api/v1/groups").json()["groups"][0]["color"], "#E5484D")
        self.assertEqual(self.sara.get("/api/v1/groups").json()["groups"][0]["color"], "#3E63DD")  # only theirs changed

    def test_only_friends_can_be_added(self):
        r = self.sara.post("/api/v1/groups", {"name": "X", "color": "#3E63DD", "members": [self.ids[self.neda]]}, format="json")
        self.assertEqual(r.json()["error"], "not_a_friend")

    def test_link_joins_and_only_owner_deletes(self):
        gid, body = self.create()
        token = body["groups"][0]["token"]
        joined = self.neda.post("/api/v1/groups/join", {"token": token}, format="json").json()
        self.assertEqual(joined["joined"], gid)
        self.assertEqual(self.ali.delete(f"/api/v1/groups/{gid}").status_code, 403)
        self.assertEqual(self.ali.patch(f"/api/v1/groups/{gid}", {"name": "Mine"}, format="json").status_code, 403)
        self.assertEqual(self.sara.post(f"/api/v1/groups/{gid}/leave").status_code, 400)  # the owner deletes instead
        self.assertEqual(self.ali.post(f"/api/v1/groups/{gid}/leave").json()["groups"], [])
        self.sara.post(f"/api/v1/groups/{gid}/invite/reset")
        self.assertEqual(self.ali.post("/api/v1/groups/join", {"token": token}, format="json").status_code, 404)  # old link
        self.assertEqual(self.sara.delete(f"/api/v1/groups/{gid}").json()["groups"], [])
        self.assertEqual(self.neda.get("/api/v1/groups").json()["groups"], [])

    def test_items_are_shared_and_marks_follow_the_mode(self):
        gid, _ = self.create()
        url = f"/api/v1/groups/{gid}/items/0193e7a0-aaaa-7bbb-8ccc-000000000001"
        self.assertEqual(self.sara.put(url, {"kind": "task", "data": {"title": "Shop"}, "done_mode": "each"}, format="json").status_code, 200)
        self.assertEqual(self.ali.get("/api/v1/groups").json()["items"][0]["data"]["title"], "Shop")
        self.assertEqual(self.ali.put(url, {"kind": "task", "data": {"title": "Mine now"}}, format="json").status_code, 403)
        self.ali.put(url + "/marks", {"key": "once", "status": "done"}, format="json")
        marks = self.sara.get("/api/v1/groups").json()["items"][0]["marks"]
        self.assertEqual([(m["status"], m["me"]) for m in marks], [("done", False)])
        # Shared: clearing it clears it for everybody.
        self.sara.put(url, {"kind": "task", "data": {"title": "Shop"}, "done_mode": "shared"}, format="json")
        self.sara.put(url + "/marks", {"key": "once", "status": None}, format="json")
        self.assertEqual(self.ali.get("/api/v1/groups").json()["items"][0]["marks"], [])
        self.assertEqual(self.ali.delete(url).status_code, 403)
        self.sara.delete(url)
        self.assertEqual(self.ali.get("/api/v1/groups").json()["items"], [])

    def test_admins_add_items_members_only_tick(self):
        gid, body = self.create()
        url = f"/api/v1/groups/{gid}/items/0193e7a0-aaaa-7bbb-8ccc-000000000003"
        self.assertEqual(self.ali.put(url, {"kind": "task", "data": {"title": "X"}}, format="json").json()["error"], "not_admin")
        r = self.sara.patch(f"/api/v1/groups/{gid}", {"admins": [self.ids[self.ali]]}, format="json").json()
        self.assertEqual([m["admin"] for m in r["groups"][0]["members"] if not m["me"]], [True])
        self.assertEqual(self.ali.get("/api/v1/groups").json()["groups"][0]["admin"], True)
        self.assertEqual(self.ali.put(url, {"kind": "task", "data": {"title": "X"}}, format="json").status_code, 200)
        self.assertEqual(self.ali.patch(f"/api/v1/groups/{gid}", {"admins": []}, format="json").status_code, 403)  # owner's job
        self.assertEqual(self.ali.delete(f"/api/v1/groups/{gid}").status_code, 403)
        self.neda.post("/api/v1/groups/join", {"token": body["groups"][0]["token"]}, format="json")
        url2 = url[:-1] + "4"
        self.assertEqual(self.neda.put(url2, {"kind": "task", "data": {}}, format="json").status_code, 403)

    def test_outsiders_see_nothing(self):
        gid, _ = self.create()
        self.assertEqual(self.neda.patch(f"/api/v1/groups/{gid}", {"color": "#E5484D"}, format="json").status_code, 404)
        url = f"/api/v1/groups/{gid}/items/0193e7a0-aaaa-7bbb-8ccc-000000000002"
        self.assertEqual(self.neda.put(url, {"kind": "task", "data": {}}, format="json").status_code, 404)
