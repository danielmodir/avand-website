import uuid

from apps.common.testing import ApiTestCase
from apps.planning.models import Task


def new_id():
    return str(uuid.uuid4())


class PlanningTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()

    def put(self, kind, item_id, body, client=None):
        return (client or self.client).put(f"/api/v1/planning/{kind}/{item_id}", body, format="json")

    def test_create_then_update_with_version(self):
        tid = new_id()
        created = self.put("tasks", tid, {"title": "Write report", "start_date": "2026-10-15", "end_date": "2026-10-18"})
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["version"], 1)
        updated = self.put("tasks", tid, {"title": "Write the report", "version": 1})
        self.assertEqual(updated.json()["version"], 2)
        stale = self.put("tasks", tid, {"title": "lost update", "version": 1})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["current"]["title"], "Write the report")

    def test_validation(self):
        bad_range = self.put("tasks", new_id(), {"title": "x", "start_date": "2026-10-15", "end_date": "2026-10-01"})
        self.assertEqual(bad_range.json()["error"], "end_before_start")
        no_days = self.put("tasks", new_id(), {"title": "x", "start_date": "2026-10-15", "rec_mode": "weekdays"})
        self.assertEqual(no_days.json()["error"], "weekdays_required")
        no_time = self.put("habits", new_id(), {"title": "Read", "start_date": "2026-10-15", "reminder_type": "at_time"})
        self.assertEqual(no_time.json()["error"], "reminder_time_required")

    def test_subtasks_are_one_level_and_do_not_repeat(self):
        parent, child = new_id(), new_id()
        self.put("tasks", parent, {"title": "Parent", "start_date": "2026-10-15"})
        self.assertEqual(self.put("tasks", child, {"title": "Child", "start_date": "2026-10-16", "end_date": "2026-10-18", "parent_id": parent}).status_code, 201)
        grandchild = self.put("tasks", new_id(), {"title": "Too deep", "start_date": "2026-10-15", "parent_id": child})
        self.assertEqual(grandchild.json()["error"], "task.subtask_depth")
        recurring = self.put("tasks", new_id(), {"title": "R", "start_date": "2026-10-15", "parent_id": parent, "rec_mode": "interval"})
        self.assertEqual(recurring.json()["error"], "task.subtask_recurring")

        self.assertEqual(self.client.delete(f"/api/v1/planning/tasks/{parent}").status_code, 204)
        self.assertIsNotNone(Task.objects.get(pk=child).deleted_at)  # deleted with its parent

    def test_users_cannot_touch_each_others_rows(self):
        cat, tid = new_id(), new_id()
        self.put("categories", cat, {"name": "Work"})
        self.put("tasks", tid, {"title": "Mine", "start_date": "2026-10-15"})
        other = self.register("other@example.com", "Ali")
        self.assertEqual(self.put("tasks", tid, {"title": "Stolen", "version": 1}, client=other).status_code, 404)
        foreign_cat = self.put("tasks", new_id(), {"title": "x", "start_date": "2026-10-15", "category_id": cat}, client=other)
        self.assertEqual(foreign_cat.json()["error"], "category_not_found")
        self.assertEqual(other.put(f"/api/v1/planning/tasks/{tid}/occurrences/2026-10-15", {"status": "done"}, format="json").status_code, 404)

    def test_each_day_of_a_recurring_task_is_ticked_separately(self):
        tid = new_id()
        self.put("tasks", tid, {"title": "Daily", "start_date": "2026-10-15", "rec_mode": "interval", "rec_interval": 1})
        done = self.client.put(f"/api/v1/planning/tasks/{tid}/occurrences/2026-10-15", {"status": "done"}, format="json")
        self.assertEqual(done.json()["status"], "done")
        self.assertIsNotNone(done.json()["completed_at"])
        sync = self.client.get("/api/v1/planning/sync").json()
        self.assertEqual([o["occurrence_date"] for o in sync["task_occurrences"]], ["2026-10-15"])

    def test_incremental_sync_carries_changes_and_deletions(self):
        keep, gone = new_id(), new_id()
        self.put("tasks", keep, {"title": "Keep", "start_date": "2026-10-15"})
        self.put("tasks", gone, {"title": "Gone", "start_date": "2026-10-15"})
        first = self.client.get("/api/v1/planning/sync").json()
        self.assertEqual(len(first["tasks"]), 2)

        self.client.delete(f"/api/v1/planning/tasks/{gone}")
        later = self.client.get("/api/v1/planning/sync", {"since": first["server_time"]}).json()
        changes = {t["id"]: t["deleted_at"] is not None for t in later["tasks"]}
        self.assertTrue(changes[gone])  # the deletion always arrives
        self.assertFalse(changes.get(keep, False))  # keep may repeat (overlap) but never as deleted
        full = self.client.get("/api/v1/planning/sync").json()
        self.assertEqual([t["id"] for t in full["tasks"]], [keep])

    def test_events_with_time(self):
        ok = self.put("events", new_id(), {"title": "Class", "start_date": "2026-10-15", "all_day": False, "start_time": "19:30", "end_time": "21:00", "reminder_type": "before_start", "reminder_minutes_before": 15})
        self.assertEqual(ok.status_code, 201, ok.content)
        bad = self.put("events", new_id(), {"title": "Class", "start_date": "2026-10-15", "all_day": False, "start_time": "21:00", "end_time": "19:30"})
        self.assertEqual(bad.json()["error"], "end_before_start")
