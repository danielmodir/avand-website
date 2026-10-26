"""Connect to AI: the personal MCP link (apps/core/mcp.py) and its tools
(apps/planning/mcp.py)."""
import json

from rest_framework.test import APIClient

from apps.common.testing import ApiTestCase
from apps.planning.mcp import today


class McpTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()
        self.url = self.client.post("/api/v1/me/mcp").json()["url"]
        self.path = self.url.split("testserver", 1)[1]
        self.anon = APIClient()
        self.seq = 0

    def rpc(self, method, params=None, path=None):
        self.seq += 1
        body = {"jsonrpc": "2.0", "id": self.seq, "method": method, "params": params or {}}
        return self.anon.post(path or self.path, json.dumps(body), content_type="application/json")

    def tool(self, name, **args):
        r = self.rpc("tools/call", {"name": name, "arguments": args}).json()["result"]
        text = r["content"][0]["text"]
        return (text if r["isError"] else json.loads(text)), r["isError"]

    def test_link_lifecycle(self):
        state = self.client.get("/api/v1/me/mcp").json()
        self.assertTrue(state["connected"])
        self.assertEqual(state["url"], self.url)
        self.assertIsNone(state["last_used_at"])
        self.assertEqual(self.rpc("ping").status_code, 200)
        self.assertIsNotNone(self.client.get("/api/v1/me/mcp").json()["last_used_at"])
        # A new link kills the old one.
        new = self.client.post("/api/v1/me/mcp").json()["url"]
        self.assertNotEqual(new, self.url)
        self.assertEqual(self.rpc("ping").status_code, 401)
        self.path = new.split("testserver", 1)[1]
        self.assertEqual(self.rpc("ping").status_code, 200)
        # Disconnect.
        self.assertFalse(self.client.delete("/api/v1/me/mcp").json()["connected"])
        self.assertEqual(self.rpc("ping").json()["error"]["code"], -32001)

    def test_bearer_header_and_bad_keys(self):
        key = self.path.rsplit("/", 1)[1]
        r = self.anon.post("/api/v1/mcp", json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}), content_type="application/json",
                           HTTP_AUTHORIZATION=f"Bearer {key}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.rpc("ping", path="/api/v1/mcp/u/tjm_nope").status_code, 401)
        self.assertEqual(self.anon.get(self.path).status_code, 405)
        self.assertEqual(self.anon.post(self.path, "not json", content_type="application/json").status_code, 400)

    def test_initialize_and_list(self):
        init = self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}).json()
        self.assertEqual(init["result"]["protocolVersion"], "2025-06-18")
        notif = self.anon.post(self.path, json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}), content_type="application/json")
        self.assertEqual(notif.status_code, 202)
        names = [t["name"] for t in self.rpc("tools/list").json()["result"]["tools"]]
        self.assertEqual(names, ["get_day", "list_items", "add_task", "add_habit", "add_event", "update_item", "set_status", "delete_item"])
        self.assertEqual(self.rpc("tools/call", {"name": "nope"}).json()["error"]["code"], -32602)

    def test_tasks(self):
        added, err = self.tool("add_task", title="Buy bread", date="2026-10-26", start_time="09:00", subtasks=["Milk", "Eggs"], category="Home")
        self.assertFalse(err, added)
        task = added["added"]
        self.assertEqual((task["title"], task["date"], task["start_time"], task["category"], task["status"]), ("Buy bread", "2026-10-26", "09:00", "Home", None))
        self.assertEqual([s["title"] for s in task["subtasks"]], ["Milk", "Eggs"])
        day, _ = self.tool("get_day", date="2026-10-26")
        self.assertEqual([t["id"] for t in day["tasks"]], [task["id"]])
        self.assertEqual(day["weekday"], "Monday")
        self.assertEqual(day["jalali"], "4 Aban 1405")
        # Ticking every subtask ticks the one-off parent.
        for sub in task["subtasks"]:
            out, _ = self.tool("set_status", id=sub["id"], status="done")
        self.assertEqual(out["updated"]["status"], "done")
        out, _ = self.tool("update_item", id=task["id"], title="Buy bread and milk", end_date="2026-10-28", start_time="")
        self.assertEqual((out["updated"]["title"], out["updated"]["end_date"]), ("Buy bread and milk", "2026-10-28"))
        self.assertNotIn("start_time", out["updated"])
        # The app sees it through its own sync.
        sync = self.client.get("/api/v1/planning/sync").json()
        self.assertIn("Buy bread and milk", [t["title"] for t in sync["tasks"]])
        out, _ = self.tool("delete_item", id=task["id"])
        self.assertEqual(out["deleted"]["kind"], "task")
        self.assertEqual(self.tool("get_day", date="2026-10-26")[0]["tasks"], [])

    def test_repeating_task_and_habit(self):
        task = self.tool("add_task", title="Gym", date="2026-10-24", repeat={"type": "weekdays", "weekdays": [1, 3]})[0]["added"]
        self.assertEqual(task["repeat"], {"type": "weekdays", "weekdays": [1, 3]})
        self.assertEqual(len(self.tool("get_day", date="2026-10-26")[0]["tasks"]), 1)  # Monday
        self.assertEqual(len(self.tool("get_day", date="2026-10-27")[0]["tasks"]), 0)  # Tuesday
        msg, err = self.tool("set_status", id=task["id"], status="done", date="2026-10-27")
        self.assertTrue(err)
        self.assertIn("isn't on", msg)
        self.tool("set_status", id=task["id"], status="done", date="2026-10-26")
        self.assertEqual(self.tool("get_day", date="2026-10-26")[0]["tasks"][0]["status"], "done")
        self.assertIsNone(self.tool("get_day", date="2026-10-28")[0]["tasks"][0]["status"])

        habit = self.tool("add_habit", title="Read", start_date="2026-10-20", reminder_time="21:00")[0]["added"]
        self.assertEqual((habit["repeat"], habit["reminder_time"]), ({"type": "daily"}, "21:00"))
        self.tool("set_status", id=habit["id"], status="not_done", date="2026-10-25")
        day = self.tool("get_day", date="2026-10-25")[0]
        self.assertEqual(day["habits"][0]["status"], "not_done")
        logs = self.client.get("/api/v1/planning/sync").json()["habit_logs"]
        self.assertEqual([(l["log_date"], l["status"]) for l in logs], [("2026-10-25", "skipped")])

    def test_events_and_listing(self):
        ev, err = self.tool("add_event", title="Dentist", date="2026-11-02", start_time="16:30", end_time="17:00")
        self.assertFalse(err, ev)
        self.assertEqual(ev["added"]["start_time"], "16:30")
        self.assertTrue(self.tool("set_status", id=ev["added"]["id"], status="done")[1])
        self.tool("add_task", title="Report")
        found = self.tool("list_items", **{"from": "2026-11-01", "to": "2026-11-05"})[0]
        self.assertEqual([i["title"] for i in found["items"]], ["Dentist"])
        self.assertEqual(self.tool("list_items", query="repo")[0]["count"], 1)
        self.assertEqual(self.tool("get_day")[0]["date"], today().isoformat())

    def test_validation_and_isolation(self):
        self.assertTrue(self.tool("add_task", title="")[1])
        self.assertTrue(self.tool("add_task", title="x", date="2026-13-01")[1])
        self.assertTrue(self.tool("add_task", title="x", repeat={"type": "every_n_days", "every": 99})[1])
        self.assertTrue(self.tool("add_event", title="no date")[1])
        # Someone else's items are invisible and untouchable.
        other = self.register(email="other@example.com")
        oid = other.put("/api/v1/planning/tasks/0192c1d2-0000-7000-8000-000000000001",
                        {"title": "Secret", "start_date": "2026-10-26"}, format="json").json()["id"]
        self.assertEqual(self.tool("get_day", date="2026-10-26")[0]["tasks"], [])
        msg, err = self.tool("delete_item", id=oid)
        self.assertTrue(err)
