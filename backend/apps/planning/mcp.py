"""The tools of the person's MCP server ("Connect to AI", apps/core/mcp.py):
read and change their tasks, habits and events.

Same tools, arguments and answers as the live PHP API (backend-php/lib/mcp.php);
here they work on the planning tables through the same write paths as the
app (services.upsert / set_status / soft_delete), so versions move and the
app's next sync picks the changes up. Dates are Gregorian, "today" is Iran
time. Group items and period data are not reachable from here.
"""
import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from rest_framework.exceptions import ValidationError

from apps.calendar_data.conversions import HijriCalendar, gregorian_to_jalali
from apps.common.exceptions import ApiError
from apps.common.ids import uuid7

from . import serializers as s
from . import services
from .models import Category, Event, EventException, Habit, HabitLog, Task, TaskException, TaskOccurrence

TZ = ZoneInfo("Asia/Tehran")
WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
JALALI_MONTHS = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"]
# The app's limits (serializers.check_schedule): every N days up to 30, months up to 12, years up to 10.
REPEAT_LIMITS = {"every_n_days": 30, "monthly": 12, "yearly": 10}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ToolError(Exception):
    """A tool can't do what was asked: told to the AI app as the tool's result."""


# ── tool definitions (same as backend-php/lib/mcp.php tj_mcp_tools) ─────────

def _date(d):
    return {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$", "description": d}


def _time(d):
    return {"type": "string", "pattern": r"^\d{2}:\d{2}$", "description": d}


REPEAT = {
    "type": "object",
    "description": "How it repeats. Leave out for no repeat (habits: every day).",
    "properties": {
        "type": {"type": "string", "enum": ["none", "daily", "every_n_days", "weekdays", "monthly", "yearly"]},
        "every": {"type": "integer", "minimum": 1, "maximum": 30, "description": "every_n_days (up to 30) / monthly (up to 12) / yearly (up to 10): the step."},
        "weekdays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}, "description": "weekdays: 0 = Sunday … 6 = Saturday."},
        "calendar": {"type": "string", "enum": ["jalali", "gregorian", "hijri"], "description": "monthly / yearly: the calendar whose day of the month is kept (default jalali)."},
    },
    "required": ["type"],
}
REMINDER = _time("Reminder time on the day (HH:MM). Empty string removes the reminder.")
ITEM_ID = {"type": "string", "description": "The id from get_day or list_items (a subtask id works for set_status and delete_item)."}
RO = {"readOnlyHint": True, "openWorldHint": False}
RW = {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False}

TOOLS = [
    {"name": "get_day", "title": "What is on a day",
     "description": "The person's tasks, habits and events on a day, with what is done. Also the day's Jalali date and weekday.",
     "inputSchema": {"type": "object", "properties": {"date": _date("The day; default today (Iran time).")}}, "annotations": RO},
    {"name": "list_items", "title": "List tasks, habits and events",
     "description": "Every item of a kind, or the ones that happen between two dates, or whose title or text contains a word.",
     "inputSchema": {"type": "object", "properties": {
         "kind": {"type": "string", "enum": ["all", "task", "habit", "event"], "description": "Default all."},
         "from": _date('Only items that happen on or after this day (with "to", at most 366 days).'),
         "to": _date("Only items that happen on or before this day."),
         "query": {"type": "string", "description": "Only items whose title, category or description contains this."},
     }}, "annotations": RO},
    {"name": "add_task", "title": "Add a task", "description": "Adds a task. Without a date it goes on today.",
     "inputSchema": {"type": "object", "properties": {
         "title": {"type": "string"}, "date": _date("Its day (or first day). Default today."),
         "end_date": _date("Last day, for a task that spans several days."),
         "start_time": _time("Start time."), "end_time": _time("End time."),
         "description": {"type": "string"}, "category": {"type": "string"},
         "subtasks": {"type": "array", "items": {"type": "string"}, "maxItems": 3, "description": "Up to 3 subtask titles."},
         "pinned": {"type": "boolean"}, "repeat": REPEAT, "reminder_time": REMINDER,
     }, "required": ["title"]}, "annotations": RW},
    {"name": "add_habit", "title": "Add a habit",
     "description": "Adds a habit, ticked day by day (every day unless repeat says otherwise).",
     "inputSchema": {"type": "object", "properties": {
         "title": {"type": "string"}, "start_date": _date("First day. Default today."), "repeat": REPEAT, "reminder_time": REMINDER,
     }, "required": ["title"]}, "annotations": RW},
    {"name": "add_event", "title": "Add an event", "description": "Adds an event (a class, a trip, an appointment…).",
     "inputSchema": {"type": "object", "properties": {
         "title": {"type": "string"}, "date": _date("Its day (or first day)."),
         "end_date": _date("Last day, for an event over several days."),
         "start_time": _time("Start time."), "end_time": _time("End time."),
         "description": {"type": "string"}, "repeat": REPEAT, "reminder_time": REMINDER,
     }, "required": ["title", "date"]}, "annotations": RW},
    {"name": "update_item", "title": "Change a task, habit or event",
     "description": 'Changes only the fields given. For a habit, "date" is its first day. An empty string clears end_date, the times, description, category or reminder_time.',
     "inputSchema": {"type": "object", "properties": {
         "id": ITEM_ID, "title": {"type": "string"}, "date": _date("New day (first day)."),
         "end_date": _date("New last day."), "start_time": _time("New start time."), "end_time": _time("New end time."),
         "description": {"type": "string"}, "category": {"type": "string"}, "pinned": {"type": "boolean"},
         "repeat": REPEAT, "reminder_time": REMINDER,
     }, "required": ["id"]}, "annotations": RW},
    {"name": "set_status", "title": "Mark done or not done",
     "description": "Marks a task, subtask or habit as done or not done, or clears the mark. Repeating tasks and habits are marked per day.",
     "inputSchema": {"type": "object", "properties": {
         "id": ITEM_ID, "status": {"type": "string", "enum": ["done", "not_done", "none"]},
         "date": _date("The day, for a habit or a repeating task. Default today."),
     }, "required": ["id", "status"]},
     "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}},
    {"name": "delete_item", "title": "Delete a task, habit or event",
     "description": "Deletes it for good (a habit with its whole history). Ask the person first.",
     "inputSchema": {"type": "object", "properties": {"id": ITEM_ID}, "required": ["id"]},
     "annotations": {"readOnlyHint": False, "destructiveHint": True, "openWorldHint": False}},
]
TOOL_NAMES = {t["name"] for t in TOOLS}

INSTRUCTIONS = (
    "Toojibee is this person's planner: tasks (one-off or repeating, up to 3 subtasks), habits (ticked per day) and events. "
    "Start with get_day (today by default) or list_items; every change needs an id from them. "
    "Dates are Gregorian YYYY-MM-DD and times HH:MM, in Iran time; the reply of get_day also gives the Jalali (Persian) date. "
    "Weekdays are numbers, 0 = Sunday … 6 = Saturday. Write titles in the language the person uses."
)


# ── dates ─────────────────────────────────────────────────────────────────

def today():
    return datetime.now(TZ).date()


def sun0(d):
    """0 = Sunday … 6 = Saturday (the app's Date.getDay())."""
    return (d.weekday() + 1) % 7


class Calendars:
    """Jalali / Gregorian / Hijri parts of a date, Hijri from the official table."""

    def __init__(self):
        self._hijri = None

    def parts(self, d, cal):
        if cal == "gregorian":
            return d.year, d.month, d.day
        if cal == "hijri":
            if self._hijri is None:
                self._hijri = HijriCalendar.from_db()
            return self._hijri.convert(d)[:3]
        return gregorian_to_jalali(d.year, d.month, d.day)


def monthly_matches(row, d, cals):
    """Same rule as monthlyRepeatMatches() in frontend/demo/js/core/state.js."""
    cal = row.rec_calendar or "jalali"
    a = cals.parts(row.rec_anchor or row.start_date, cal)
    p = cals.parts(d, cal)
    last = cals.parts(d + timedelta(days=1), cal)[1] != p[1]
    if not (p[2] == a[2] or (a[2] > p[2] and last)):
        return False
    n = max(1, row.rec_interval or 1)
    if row.rec_mode == "monthly":
        diff = (p[0] - a[0]) * 12 + (p[1] - a[1])
        return diff >= 0 and diff % n == 0
    if p[1] != a[1]:
        return False
    diff = p[0] - a[0]
    return diff >= 0 and diff % n == 0


def occurs(row, d, cals, skipped_days=()):
    """Same as occursOnDate() / habitOccursOnDate() in state.js, plus the
    series' end (rec_until) and days taken out of it (exceptions)."""
    start, mode = row.start_date, row.rec_mode
    if d < start or (row.rec_until and d > row.rec_until) or d in skipped_days:
        return False
    if mode == "none":
        return start <= d <= row.end_date if row.end_date else d == start
    if mode == "interval":
        return (d - start).days % max(1, row.rec_interval or 1) == 0
    if mode == "weekdays":
        return bool(row.rec_weekdays & (1 << sun0(d))) if row.rec_weekdays else d == start
    return monthly_matches(row, d, cals)


# ── reading the person's data ──────────────────────────────────────────────

class Planner:
    """One person's live items, loaded once per tool call."""

    def __init__(self, user_id):
        self.user_id = user_id
        live = {"user_id": user_id, "deleted_at__isnull": True}
        self.tasks = list(Task.objects.filter(**live).order_by("sort_order", "created_at"))
        self.habits = list(Habit.objects.filter(**live).order_by("sort_order", "created_at"))
        self.events = list(Event.objects.filter(**live).order_by("start_date", "created_at"))
        self.categories = {c.id: c.name for c in Category.objects.filter(**live)}
        self.task_status = {(o.task_id, o.occurrence_date): o.status for o in TaskOccurrence.objects.filter(user_id=user_id)}
        self.habit_status = {(log.habit_id, log.log_date): log.status for log in HabitLog.objects.filter(user_id=user_id)}
        self.skipped = {}
        for model, field in ((TaskException, "task_id"), (EventException, "event_id")):
            for x in model.objects.filter(user_id=user_id, deleted_at__isnull=True):
                self.skipped.setdefault(getattr(x, field), set()).add(x.occurrence_date)
        self.cals = Calendars()

    def top_tasks(self):
        return [t for t in self.tasks if t.parent_id is None]

    def subtasks(self, task):
        return [t for t in self.tasks if t.parent_id == task.id]

    def lists(self):
        return {"task": self.top_tasks(), "habit": self.habits, "event": self.events}

    def occurs(self, row, d):
        return occurs(row, d, self.cals, self.skipped.get(row.id, ()))

    def find(self, item_id):
        """(kind, row, parent task or None), or a ToolError."""
        for t in self.tasks:
            if str(t.id) == item_id:
                parent = next((p for p in self.tasks if p.id == t.parent_id), None) if t.parent_id else None
                return ("subtask" if parent else "task"), t, parent
        for kind, rows in (("habit", self.habits), ("event", self.events)):
            for r in rows:
                if str(r.id) == item_id:
                    return kind, r, None
        raise ToolError(f"No task, habit or event has the id {item_id}. Use get_day or list_items for the ids.")

    # what the tools show
    def status(self, kind, row, day):
        if kind == "habit":
            if day is None:
                return None
            st = self.habit_status.get((row.id, day))
            return "done" if st == "done" else "not_done" if st == "skipped" else None
        if kind == "event":
            return None
        if row.rec_mode != "none":
            if day is None:
                return None
            st = self.task_status.get((row.id, day))
        else:
            st = self.task_status.get((row.id, row.start_date))
        return st if st in ("done", "not_done") else None

    def out(self, kind, row, day=None):
        o = {"id": str(row.id), "kind": kind, "title": row.title}
        if kind == "habit":
            o["start_date"] = row.start_date.isoformat()
            o["repeat"] = repeat_out(row) or {"type": "daily"}
            if row.tracker and row.tracker.get("kind"):
                o["tracker"] = row.tracker["kind"]  # counter / timer: ticked in the app
        else:
            o["date"] = row.start_date.isoformat()
            if row.end_date:
                o["end_date"] = row.end_date.isoformat()
            if row.start_time:
                o["start_time"] = row.start_time.strftime("%H:%M")
            if row.end_time:
                o["end_time"] = row.end_time.strftime("%H:%M")
            o["repeat"] = repeat_out(row)
            if (row.description or "").strip():
                o["description"] = row.description
        if kind == "task":
            if row.category_id and self.categories.get(row.category_id):
                o["category"] = self.categories[row.category_id]
            if row.pinned:
                o["pinned"] = True
            subs = [{"id": str(x.id), "title": x.title, "status": self.status("task", x, None)} for x in self.subtasks(row)]
            if subs:
                o["subtasks"] = subs
        if row.reminder_type in ("at_time", "repeating") and row.reminder_time:
            o["reminder_time"] = row.reminder_time.strftime("%H:%M")
        if kind != "event" and (day is not None or kind == "task"):
            o["status"] = self.status(kind, row, day)
        return o


def repeat_out(row):
    n = max(1, row.rec_interval or 1)
    if row.rec_mode == "interval":
        return {"type": "daily"} if n == 1 else {"type": "every_n_days", "every": n}
    if row.rec_mode == "weekdays":
        return {"type": "weekdays", "weekdays": [d for d in range(7) if row.rec_weekdays & (1 << d)]}
    if row.rec_mode in ("monthly", "yearly"):
        return {"type": row.rec_mode, "every": n, "calendar": row.rec_calendar or "jalali"}
    return None


# ── reading the tools' arguments ─────────────────────────────────────────────

def text_arg(a, k, max_len, required=False):
    v = a.get(k)
    if v is None:
        if required:
            raise ToolError(f'"{k}" is required.')
        return None
    if not isinstance(v, str):
        raise ToolError(f'"{k}" must be text.')
    v = v.strip()
    if required and not v:
        raise ToolError(f'"{k}" can\'t be empty.')
    if len(v) > max_len:
        raise ToolError(f'"{k}" is too long (at most {max_len} characters).')
    return v


def date_arg(a, k):
    """None = not given, "" = clear, else a date."""
    v = text_arg(a, k, 10)
    if not v:
        return v
    try:
        if not DATE_RE.match(v):
            raise ValueError
        return date.fromisoformat(v)
    except ValueError:
        raise ToolError(f'"{k}" must be a date like 2026-10-26.')


def time_arg(a, k):
    v = text_arg(a, k, 5)
    if not v:
        return v
    if not TIME_RE.match(v):
        raise ToolError(f'"{k}" must be a time like 18:30.')
    return time.fromisoformat(v)


def bool_arg(a, k):
    v = a.get(k)
    if v is None:
        return None
    if not isinstance(v, bool):
        raise ToolError(f'"{k}" must be true or false.')
    return v


def recurrence(r, kind, start):
    """The planning rec_* fields from a "repeat" argument."""
    none = {"rec_mode": "interval" if kind == "habit" else "none", "rec_interval": 1, "rec_weekdays": 0, "rec_anchor": None}
    if r is None:
        return none
    if not isinstance(r, dict):
        raise ToolError('"repeat" must be an object like {"type": "weekdays", "weekdays": [6, 1]}.')
    kind_ = r.get("type", "none")
    every = r.get("every", 1)
    if not isinstance(every, int) or isinstance(every, bool) or every < 1 or every > REPEAT_LIMITS.get(kind_, 30):
        raise ToolError(f'"repeat.every" must be a whole number from 1 to {REPEAT_LIMITS.get(kind_, 30)}.')
    if kind_ == "none":
        return none
    if kind_ == "daily":
        return {"rec_mode": "interval", "rec_interval": 1, "rec_weekdays": 0, "rec_anchor": None}
    if kind_ == "every_n_days":
        return {"rec_mode": "interval", "rec_interval": every, "rec_weekdays": 0, "rec_anchor": None}
    if kind_ == "weekdays":
        days = r.get("weekdays")
        if not isinstance(days, list) or not days:
            raise ToolError('"repeat.weekdays" needs at least one day (0 = Sunday … 6 = Saturday).')
        if any(not isinstance(x, int) or isinstance(x, bool) or not 0 <= x <= 6 for x in days):
            raise ToolError('"repeat.weekdays" are numbers from 0 (Sunday) to 6 (Saturday).')
        return {"rec_mode": "weekdays", "rec_interval": 1, "rec_weekdays": sum(1 << x for x in set(days)), "rec_anchor": None}
    if kind_ in ("monthly", "yearly"):
        cal = r.get("calendar", "jalali")
        if cal not in ("jalali", "gregorian", "hijri"):
            raise ToolError('"repeat.calendar" is jalali, gregorian or hijri.')
        return {"rec_mode": kind_, "rec_interval": every, "rec_weekdays": 0, "rec_anchor": start, "rec_calendar": cal}
    raise ToolError('"repeat.type" is none, daily, every_n_days, weekdays, monthly or yearly.')


def reminder(t):
    if t:
        return {"reminder_type": "at_time", "reminder_time": t, "reminder_every_hours": None, "reminder_date": None}
    return {"reminder_type": "none", "reminder_time": None, "reminder_every_hours": None}


def span(start, end):
    if end and end < start:
        raise ToolError('"end_date" is before the first day.')
    return start, (end if end and end != start else None)


def wire(values):
    """Model values -> what the serializers take (ISO dates and times)."""
    out = {}
    for k, v in values.items():
        out[k] = v.isoformat() if isinstance(v, (date, time)) else v
    return out


def save(model, serializer, user_id, item_id, data):
    try:
        return services.upsert(model, serializer, user_id, item_id, wire(data))[0]
    except ApiError as e:
        raise ToolError(f"Not saved: {e.code}.")
    except ValidationError as e:
        raise ToolError(f"Not saved: {e.detail}.")


def category_id(planner, name):
    """The category with this name (made if new), as the app does."""
    if not name:
        return None
    for cid, n in planner.categories.items():
        if n == name:
            return str(cid)
    return save(Category, s.CategorySerializer, planner.user_id, uuid7(), {"name": name[:40]})["id"]


def set_task_status(user_id, task, day, status):
    services.set_status(TaskOccurrence, "task", task, day, {"done": "done", "not_done": "not_done"}.get(status, "pending"), user_id,
                        TaskOccurrence.Status.values, TaskOccurrence.Status.DONE)


# ── the tools ──────────────────────────────────────────────────────────────

def call(user_id, name, a):
    if name == "get_day":
        day = date_arg(a, "date") or today()
        p = Planner(user_id)
        jy, jm, jd = gregorian_to_jalali(day.year, day.month, day.day)
        out = {"date": day.isoformat(), "jalali": f"{jd} {JALALI_MONTHS[jm - 1]} {jy}", "weekday": WEEKDAY_NAMES[sun0(day)],
               "today": today().isoformat()}
        for kind, rows in p.lists().items():
            out[kind + "s"] = [p.out(kind, r, day) for r in rows if p.occurs(r, day)]
        return out

    if name == "list_items":
        kind = a.get("kind", "all")
        if kind not in ("all", "task", "habit", "event"):
            raise ToolError('"kind" is all, task, habit or event.')
        start, end = date_arg(a, "from") or None, date_arg(a, "to") or None
        start, end = start or end, end or start
        if start and (end < start or (end - start).days > 365):
            raise ToolError('"from"…"to" must be in order and at most 366 days.')
        q = (text_arg(a, "query", 100) or "").lower()
        p = Planner(user_id)
        out = []
        for k, rows in p.lists().items():
            if kind not in ("all", k):
                continue
            for r in rows:
                hay = " ".join([r.title, p.categories.get(getattr(r, "category_id", None), "") or "", getattr(r, "description", "") or ""]).lower()
                if q and q not in hay:
                    continue
                if start and not any(p.occurs(r, start + timedelta(days=i)) for i in range((end - start).days + 1)):
                    continue
                out.append(p.out(k, r))
        return {"count": len(out), "items": out[:200]}

    if name in ("add_task", "add_event"):
        kind = "task" if name == "add_task" else "event"
        title = text_arg(a, "title", 300, required=True)
        day = date_arg(a, "date")
        if kind == "event" and not day:
            raise ToolError('"date" is required for an event.')
        start, end = span(day or today(), date_arg(a, "end_date"))
        st, et = time_arg(a, "start_time") or None, time_arg(a, "end_time") or None
        if st and et and et < st:
            raise ToolError('"end_time" is before "start_time".')
        p = Planner(user_id)
        data = {"title": title, "description": text_arg(a, "description", 2000) or "", "start_date": start, "end_date": end,
                "start_time": st, "end_time": et, **recurrence(a.get("repeat"), kind, start), **reminder(time_arg(a, "reminder_time"))}
        if kind == "event":
            data["all_day"] = st is None
            row = save(Event, s.EventSerializer, user_id, uuid7(), data)
            p = Planner(user_id)
            return {"added": p.out("event", p.find(row["id"])[1])}
        subs = a.get("subtasks") or []
        if not isinstance(subs, list) or len(subs) > 3 or any(not isinstance(x, str) or not x.strip() or len(x) > 300 for x in subs):
            raise ToolError('"subtasks" is a list of at most 3 titles (1 to 300 characters each).')
        data.update(pinned=bool(bool_arg(a, "pinned")), category_id=category_id(p, text_arg(a, "category", 40)))
        row = save(Task, s.TaskSerializer, user_id, uuid7(), data)
        for i, title in enumerate(subs):
            save(Task, s.TaskSerializer, user_id, uuid7(), {"parent_id": row["id"], "title": title.strip(), "start_date": start, "sort_order": i, "rec_mode": "none"})
        p = Planner(user_id)
        return {"added": p.out("task", p.find(row["id"])[1])}

    if name == "add_habit":
        start = date_arg(a, "start_date") or today()
        data = {"title": text_arg(a, "title", 300, required=True), "start_date": start,
                **recurrence(a.get("repeat"), "habit", start), **reminder(time_arg(a, "reminder_time"))}
        row = save(Habit, s.HabitSerializer, user_id, uuid7(), data)
        p = Planner(user_id)
        return {"added": p.out("habit", p.find(row["id"])[1])}

    if name == "update_item":
        p = Planner(user_id)
        kind, row, _ = p.find(text_arg(a, "id", 64, required=True))
        if kind == "subtask":
            raise ToolError("Subtasks can only be marked (set_status) or deleted here; change their parent task in the app.")
        data = {"version": row.version}
        title = text_arg(a, "title", 300)
        if title is not None:
            if not title:
                raise ToolError('"title" can\'t be empty.')
            data["title"] = title
        if kind != "habit" and (v := text_arg(a, "description", 2000)) is not None:
            data["description"] = v
        if kind == "task" and (v := text_arg(a, "category", 40)) is not None:
            data["category_id"] = category_id(p, v)
        if kind == "task" and (v := bool_arg(a, "pinned")) is not None:
            data["pinned"] = v
        day = date_arg(a, "date")
        if kind == "habit":
            if day:
                data["start_date"] = day
        else:
            end = date_arg(a, "end_date")
            if day or end is not None:
                data["start_date"], data["end_date"] = span(day or row.start_date, end if end is not None else row.end_date)
            st, et = time_arg(a, "start_time"), time_arg(a, "end_time")
            if st is not None:
                data["start_time"] = st or None
            if et is not None:
                data["end_time"] = et or None
            if kind == "event" and (st is not None or et is not None):
                data["all_day"] = (data.get("start_time", row.start_time)) is None
        if "repeat" in a:
            data.update(recurrence(a["repeat"], kind, data.get("start_date", row.start_date)))
        r = time_arg(a, "reminder_time")
        if r is not None:
            data.update(reminder(r or None))
        model, serializer = {"task": (Task, s.TaskSerializer), "habit": (Habit, s.HabitSerializer), "event": (Event, s.EventSerializer)}[kind]
        save(model, serializer, user_id, row.id, data)
        p = Planner(user_id)
        return {"updated": p.out(kind, p.find(str(row.id))[1])}

    if name == "set_status":
        status = a.get("status")
        if status not in ("done", "not_done", "none"):
            raise ToolError('"status" is done, not_done or none.')
        day = date_arg(a, "date") or today()
        p = Planner(user_id)
        kind, row, parent = p.find(text_arg(a, "id", 64, required=True))
        if kind == "event":
            raise ToolError("Events have no done / not done.")
        if kind == "habit":
            if not p.occurs(row, day):
                raise ToolError(f"This habit isn't on {day.isoformat()}.")
            services.set_status(HabitLog, "habit", row, day, {"done": "done", "not_done": "skipped"}.get(status, "pending"), user_id,
                                HabitLog.Status.values, HabitLog.Status.DONE)
            return {"updated": Planner(user_id).out("habit", row, day)}
        if kind == "subtask":
            set_task_status(user_id, row, row.start_date, status)
            if parent.rec_mode == "none":
                # A one-off parent follows its subtasks (the app does the same).
                p = Planner(user_id)
                all_done = all(p.status("task", x, None) == "done" for x in p.subtasks(parent))
                if all_done or p.status("task", parent, None) == "done":
                    set_task_status(user_id, parent, parent.start_date, "done" if all_done else "none")
            p = Planner(user_id)
            return {"updated": p.out("task", p.find(str(parent.id))[1])}
        if row.rec_mode != "none":
            if not p.occurs(row, day):
                raise ToolError(f"This repeating task isn't on {day.isoformat()}.")
            set_task_status(user_id, row, day, status)
            return {"updated": Planner(user_id).out("task", row, day)}
        set_task_status(user_id, row, row.start_date, status)
        for sub in p.subtasks(row):
            set_task_status(user_id, sub, sub.start_date, status)
        p = Planner(user_id)
        return {"updated": p.out("task", p.find(str(row.id))[1])}

    if name == "delete_item":
        p = Planner(user_id)
        kind, row, _ = p.find(text_arg(a, "id", 64, required=True))
        model = {"task": Task, "subtask": Task, "habit": Habit, "event": Event}[kind]
        services.soft_delete(model, user_id, row.id)
        return {"deleted": {"id": str(row.id), "kind": kind, "title": row.title}}

    raise ToolError("Unknown tool.")
