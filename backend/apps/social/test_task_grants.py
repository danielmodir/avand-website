from apps.common.testing import ApiTestCase
from apps.planning.models import Task


class TaskGrantsTests(ApiTestCase):
    def test_live_task_privacy_revocation_and_version(self):
        a = self.register("a@example.com")
        b = self.register("b@example.com")
        c = self.register("c@example.com")
        uid, friend = a.tokens["user_id"], b.tokens["user_id"]
        task = Task.objects.create(user_id=uid, title="First", description="notes", start_date="2026-11-15")
        url = "/api/v1/social/task-shares"
        data = dict(task_id=str(task.pk), recipient=friend, role="viewer")
        self.assertEqual(a.post(url, data, format="json").status_code, 404)
        a.post(f"/api/v1/social/connections/{friend}/request")
        b.post(f"/api/v1/social/connections/{uid}/respond", {"accept": True}, format="json")
        res = a.post(url, data, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        detail = url + "/" + res.json()["id"]
        body = dict(title="Updated", version=1)
        self.assertEqual(b.patch(detail, body, format="json").status_code, 403)
        self.assertEqual(c.get(url).json(), [])
        self.assertEqual(c.delete(detail).status_code, 404)
        self.assertEqual(a.post(url, dict(data, role="editor"), format="json").status_code, 201)
        self.assertEqual(b.patch(detail, body, format="json").status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.title, "Updated")
        self.assertEqual(b.patch(detail, body, format="json").status_code, 409)
        self.assertEqual(a.delete(detail).status_code, 204)
        self.assertEqual(b.get(url).json(), [])
        self.assertEqual(b.patch(detail, body, format="json").status_code, 404)
