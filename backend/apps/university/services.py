from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import math
import re
from urllib.parse import urlsplit

from apps.common.exceptions import ApiError

from .models import DeskOwner

KINDS = ("dossiers", "terms", "courses", "transfers", "activities", "resources")
ACTIVITIES = ("class", "exam", "assignment")
RULES = {
    "failed": ("include", "exclude"),
    "withdrawn": ("include", "exclude"),
    "repeated": ("all", "latest", "highest"),
    "equivalent": ("include", "exclude"),
}
FIELDS = {
    "dossiers": (("university", 160), ("degree", 100), ("field", 120), ("specialization", 120), ("status", 40)),
    "terms": (("title", 160), ("academicYear", 40), ("semester", 40), ("status", 40)),
    "courses": (("title", 160), ("courseKey", 100), ("unitType", 80), ("instructor", 160), ("notes", 4000)),
    "transfers": (("notes", 4000),),
    "activities": (),
    "resources": (("title", 160), ("notes", 4000)),
}
REQUIRED = {"dossiers": "university", "terms": "title", "courses": "title", "resources": "title"}


def invalid(field):
    raise ApiError("validation_error", extra={"field": field})


def text(value, field, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        invalid(field)
    return value.strip()


def identifier(value, field):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        invalid(field)
    return value


def number(value, field, maximum, minimum=0, optional=False):
    if optional and value is None:
        return None
    if type(value) not in (int, float) or not minimum <= value <= maximum or not math.isfinite(value):
        invalid(field)
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def choice(value, field, choices):
    if value not in choices:
        invalid(field)
    return value


def boolean(value, field):
    if type(value) is not bool:
        invalid(field)
    return value


def date_value(value, field):
    if value is None or value == "":
        return None
    if isinstance(value, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            pass
    invalid(field)


def normalize(kind, data):
    if not isinstance(data, dict):
        invalid("id")
    record = {"id": identifier(data.get("id"), "id").lower()}
    for field, limit in FIELDS[kind]:
        value = data.get(field, "")
        if field == "semester" and type(value) is int and 0 <= value <= 9:
            value = str(value)
        record[field] = text(value, field, limit, field == REQUIRED.get(kind))
    if kind in ("dossiers", "terms"):
        for field in ("startDate", "endDate"):
            record[field] = date_value(data.get(field), field)
        if record["startDate"] and record["endDate"] and record["startDate"] > record["endDate"]:
            invalid("endDate")
    if kind == "dossiers":
        rules = data.get("gpaRules", {})
        defaults = data.get("planningDefaults", {})
        if not isinstance(rules, dict):
            invalid("gpaRules")
        if not isinstance(defaults, dict):
            invalid("planningDefaults")
        record["gpaRules"] = {field: choice(rules.get(field), field, (None, *values)) for field, values in RULES.items()}
        record["gpaRules"]["passMark"] = number(rules.get("passMark"), "passMark", 20, optional=True)
        record["planningDefaults"] = {field: boolean(defaults.get(field, False), field) for field in ACTIVITIES}
        record["active"] = boolean(data.get("active", False), "active")
    if kind == "terms":
        record["dossierId"] = identifier(data.get("dossierId"), "dossierId").lower()
    if kind == "courses":
        record["termId"] = identifier(data.get("termId"), "termId").lower()
        record["credits"] = number(data.get("credits"), "credits", 100, 0.01)
        record["grade"] = number(data.get("grade"), "grade", 20, optional=True)
        record["status"] = choice(data.get("status", "ongoing"), "status", (
            "ongoing", "passed", "failed", "withdrawn", "equivalent",
        ))
    if kind == "transfers":
        for field in ("sourceCourseId", "targetCourseId"):
            record[field] = identifier(data.get(field), field).lower()
        record["status"] = choice(data.get("status", "pending"), "status", ("pending", "approved", "rejected"))
        record["acceptedCredits"] = number(data.get("acceptedCredits"), "acceptedCredits", 100, optional=True)
        record["grade"] = number(data.get("grade"), "grade", 20, optional=True)
    if kind in ("activities", "resources"):
        record["courseId"] = identifier(data.get("courseId"), "courseId").lower()
    if kind == "activities":
        record["itemId"] = identifier(data.get("itemId"), "itemId")
        record["type"] = choice(data.get("type"), "type", ACTIVITIES)
        if "showInPlanning" in data:
            record["showInPlanning"] = boolean(data["showInPlanning"], "showInPlanning")
    if kind == "resources":
        record["type"] = choice(data.get("type", "note"), "type", ("link", "book", "note"))
        record["url"] = text(data.get("url", ""), "url", 2048)
        if record["url"]:
            try:
                url = urlsplit(record["url"])
                acceptable = url.scheme in ("https", "http") and url.hostname and re.fullmatch(
                    r"https?://[^\s\\]+", record["url"], flags=re.IGNORECASE
                )
            except ValueError:
                acceptable = False
            if not acceptable:
                invalid("url")
        elif record["type"] == "link":
            invalid("url")
    return record


def lookup(state, kind, key):
    record = state[kind].get(key)
    if record is None:
        raise ApiError("not_found", 404)
    return record


def prepare_record(kind, record, state):
    old = state[kind].get(record["id"])
    parent_fields = {
        "terms": ("dossierId",), "courses": ("termId",),
        "activities": ("courseId", "itemId", "type"), "resources": ("courseId",),
        "transfers": ("sourceCourseId", "targetCourseId"),
    }
    for field in parent_fields.get(kind, ()):
        if old and record[field] != old[field]:
            raise ApiError("conflict", 409, extra={"field": field})

    if kind == "terms":
        lookup(state, "dossiers", record["dossierId"])
    if kind == "courses":
        lookup(state, "terms", record["termId"])
        for transfer in state["transfers"].values():
            if (transfer["targetCourseId"] == record["id"] and transfer["status"] == "approved"
                and (record["status"] != "equivalent" or record["credits"] < transfer["acceptedCredits"])):
                raise ApiError("conflict", 409)
    if kind in ("activities", "resources"):
        course = lookup(state, "courses", record["courseId"])
    if kind == "activities":
        for link in state["activities"].values():
            if link["id"] != record["id"] and link["itemId"] == record["itemId"] and (
                (link["type"] == "assignment") == (record["type"] == "assignment")
            ):
                raise ApiError("conflict", 409)
        term = lookup(state, "terms", course["termId"])
        dossier = lookup(state, "dossiers", term["dossierId"])
        if "showInPlanning" not in record:
            record["showInPlanning"] = (
                old["showInPlanning"] if old else dossier["planningDefaults"][record["type"]]
            )
    if kind == "transfers":
        source = lookup(state, "courses", record["sourceCourseId"])
        target = lookup(state, "courses", record["targetCourseId"])
        source_dossier = lookup(state, "terms", source["termId"])["dossierId"]
        target_dossier = lookup(state, "terms", target["termId"])["dossierId"]
        if source_dossier == target_dossier:
            invalid("targetCourseId")
        record["sourceDossierId"] = source_dossier
        record["targetDossierId"] = target_dossier
        record["sourceCredits"] = old["sourceCredits"] if old else source["credits"]
        record["sourceGrade"] = old["sourceGrade"] if old else source["grade"]
        record["sourceTitle"] = old["sourceTitle"] if old else source["title"]
        if record["status"] == "approved":
            if target["status"] != "equivalent":
                invalid("targetCourseId")
            if not record["acceptedCredits"] or not record["acceptedCredits"] <= target["credits"]:
                invalid("acceptedCredits")
            for link in state["transfers"].values():
                if link["id"] == record["id"] or link["status"] != "approved":
                    continue
                if link["targetCourseId"] == target["id"] or (
                    link["sourceCourseId"] == source["id"] and link["targetDossierId"] == target_dossier
                ):
                    raise ApiError("conflict", 409)
    return record


def hundredths(value):
    return int(round(value * 100))


def metrics(courses, rules, approved):
    buckets = {}
    passed = {}
    missing = set()
    total = 0
    for course in courses:
        status = course["status"]
        grade = course["grade"]
        credits = hundredths(course["credits"])
        equivalent = status == "equivalent"
        if equivalent:
            transfer = approved.get(course["id"])
            if transfer is None:
                continue
            credits = hundredths(transfer["acceptedCredits"])
            grade = transfer["grade"]
        total += credits
        key = (bool(course["courseKey"]), course["courseKey"].lower() or course["id"])
        if status == "ongoing" and grade is not None and rules["passMark"] is not None:
            status = "passed" if grade >= rules["passMark"] else "failed"
        if status in ("passed", "equivalent"):
            # A successfully repeated course earns units once. An earned
            # local attempt takes precedence for the equivalent subtotal.
            candidate = (not equivalent, credits)
            passed[key] = max(candidate, passed.get(key, candidate))
        if grade is not None:
            buckets.setdefault(key, []).append((status, hundredths(grade), credits))
    numerator = graded = 0
    for attempts in buckets.values():
        eligible = []
        for attempt in attempts:
            status, _, _ = attempt
            if status == "ongoing":
                missing.add("passMark")
            if status in ("failed", "withdrawn", "equivalent"):
                if rules[status] is None:
                    missing.add(status)
                if rules[status] == "exclude":
                    continue
            eligible.append(attempt)
        if len(eligible) > 1:
            if rules["repeated"] is None:
                missing.add("repeated")
            if rules["repeated"] == "latest":
                eligible = eligible[-1:]
            if rules["repeated"] == "highest":
                eligible = [max(reversed(eligible), key=lambda entry: entry[1])]
        for _, grade, credits in eligible:
            numerator += grade * credits
            graded += credits
    return {
        "gpa": None if missing or not graded else ((numerator * 2 + graded) // (2 * graded)) / 100,
        "gradedCredits": None if missing else graded / 100,
        "passedCredits": sum(credits for _, credits in passed.values()) / 100,
        "equivalentCredits": sum(credits for local, credits in passed.values() if not local) / 100,
        "totalCredits": total / 100,
        "missingRules": sorted(missing),
    }


def transcripts(state):
    approved = {row["targetCourseId"]: row for row in state["transfers"].values() if row["status"] == "approved"}
    terms_by_dossier = {}
    courses_by_term = {}
    for term in state["terms"].values():
        terms_by_dossier.setdefault(term["dossierId"], []).append(term)
    for course in state["courses"].values():
        courses_by_term.setdefault(course["termId"], []).append(course)
    summaries = []
    for dossier in state["dossiers"].values():
        terms = sorted(terms_by_dossier.get(dossier["id"], []), key=lambda row: row["startDate"] or "")
        all_courses = []
        term_metrics = []
        for term in terms:
            courses = courses_by_term.get(term["id"], [])
            all_courses.extend(courses)
            term_metrics.append({"termId": term["id"], **metrics(courses, dossier["gpaRules"], approved)})
        summaries.append({
            "dossierId": dossier["id"], **metrics(all_courses, dossier["gpaRules"], approved),
            "terms": term_metrics, "courses": all_courses,
        })
    return summaries


def purge_user(uid):
    DeskOwner.objects.filter(user_id=uid).delete()
