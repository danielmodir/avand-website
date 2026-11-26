from uuid import uuid4

from apps.common.testing import ApiTestCase

from .services import purge_user


class UniversityTests(ApiTestCase):
    def setUp(self):
        self.owner = self.register()

    def save(self, kind, status=200, client=None, **record):
        response = (client or self.owner).post(f"/api/v1/university/{kind}", record, format="json")
        self.assertEqual(response.status_code, status, response.content)
        return response.json()

    def state(self, client=None):
        response = (client or self.owner).get("/api/v1/university/state")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def dossier(self, id, **kwargs):
        return self.save("dossiers", id=id, university=id, **kwargs)

    def term(self, id, dossier_id, **kwargs):
        return self.save("terms", id=id, dossierId=dossier_id, title=id, **kwargs)

    def course(self, id, term_id, **kwargs):
        return self.save("courses", id=id, termId=term_id, title=id, **{"credits": 3, **kwargs})

    def test_gpa_uses_only_set_grades_and_configured_rules(self):
        self.dossier("dossier")
        self.term("old", "dossier", startDate="2025-08-01")
        self.term("current", "dossier", startDate="2026-08-01")
        self.course("attempt1", "old", grade=0, status="failed", courseKey="MATH")
        self.course("attempt2", "current", grade=16, status="passed", courseKey="math")
        self.course("ungraded", "current", grade=None)
        self.course("other", "current", grade=8, status="withdrawn", credits=1)
        transcript = self.state()["transcripts"][0]
        self.assertIsNone(transcript["gpa"])
        self.assertEqual(transcript["missingRules"], ["failed", "repeated", "withdrawn"])
        self.dossier("dossier", gpaRules={"failed": "include", "withdrawn": "exclude", "repeated": "all"})
        transcript = self.state()["transcripts"][0]
        self.assertEqual(transcript["gpa"], 8)
        self.assertEqual([term["gpa"] for term in transcript["terms"]], [0, 16])
        self.assertEqual(transcript["gradedCredits"], 6)
        self.assertEqual(transcript["passedCredits"], 3)
        self.dossier("dossier", gpaRules={"failed": "include", "withdrawn": "exclude", "repeated": "latest"})
        self.assertEqual(self.state()["transcripts"][0]["gpa"], 16)

    def test_transfer_keeps_source_snapshot_and_prevents_duplicate_credits(self):
        self.dossier("source")
        self.dossier("target", gpaRules={"equivalent": "include"})
        self.term("ts", "source")
        self.term("tt", "target")
        self.course("cs", "ts", grade=17, status="passed")
        self.course("ct", "tt", status="equivalent")
        transfer = dict(sourceCourseId="cs", targetCourseId="ct", acceptedCredits=2, grade=15, status="approved")
        self.save("transfers", id="x", **transfer)
        self.save("transfers", id="x", **transfer)
        self.save("transfers", 409, id="y", **transfer)
        self.course("cs", "ts", grade=16, status="passed")
        self.save("transfers", id="x", **transfer)
        state = self.state()
        source, target = state["transcripts"]
        self.assertEqual(source["gpa"], 16)
        self.assertEqual(state["transfers"][0]["sourceGrade"], 17)
        self.assertEqual(target["gpa"], 15)
        self.assertEqual(target["passedCredits"], 2)
        self.assertEqual(target["equivalentCredits"], 2)
        self.assertEqual(len(state["transfers"]), 1)
        self.save("courses", 409, id="ct", termId="tt", title="ct", credits=1, status="equivalent")

    def test_owner_isolation_and_purge(self):
        dossier = self.dossier("dossier")
        other = self.register("other@example.com")
        self.assertEqual(self.state(other)["dossiers"], [])
        self.save("terms", 404, client=other, id="foreign", title="Foreign", dossierId=dossier["id"])
        self.term("term", "dossier")
        self.course("source", "term")
        self.save("transfers", 404, client=other, id="theft", sourceCourseId="source", targetCourseId="other")
        self.save("dossiers", client=other, id=dossier["id"], university="Private copy")
        self.assertEqual(self.state()["dossiers"][0]["university"], "dossier")
        from apps.core.models import User
        purge_user(User.objects.get(email="user@example.com").id)
        self.assertEqual(self.state()["courses"], [])
        self.assertEqual(self.state(other)["dossiers"][0]["university"], "Private copy")

    def test_activity_reuses_owned_event_and_keeps_selected_visibility(self):
        self.dossier("dossier", planningDefaults={"class": True})
        self.term("term", "dossier")
        self.course("course", "term")
        item = str(uuid4())
        created = self.owner.put(f"/api/v1/planning/events/{item}", {
            "title": "Class", "start_date": "2026-11-18",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        data = {"id": "link", "courseId": "course", "itemId": item, "type": "class"}
        self.assertTrue(self.save("activities", **data)["showInPlanning"])
        self.save("activities", 404, id="wrong-kind", courseId="course", itemId=item, type="assignment")
        self.save("activities", 409, **{**data, "id": "duplicate"})
        self.dossier("dossier", planningDefaults={"class": False})
        self.assertTrue(self.save("activities", **data)["showInPlanning"])
        self.assertFalse(self.save("activities", **data, showInPlanning=False)["showInPlanning"])
        self.assertEqual(len(self.owner.get("/api/v1/planning/sync").json()["events"]), 1)
        self.save("resources", 400, id="unsafe", title="URL", courseId="course", type="link", url="javascript:alert(1)")
        self.save("resources", id="safe", title="URL", courseId="course", type="link", url="https://example.com/reference")
