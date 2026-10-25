"""Validation for planning writes. The database check constraints repeat
the single-row rules as a last line of defense; rules that look at other
rows (ownership, subtask depth, photo limit) live only here."""
import re

from rest_framework import serializers

from apps.common.exceptions import ApiError

from .models import Category, Event, Habit, HabitLog, Task, TaskOccurrence

COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
RECURRENCE_FIELDS = ["rec_mode", "rec_interval", "rec_weekdays", "rec_until", "rec_anchor", "rec_calendar"]
REPEAT_KINDS = ("interval", "weekdays", "monthly", "yearly")
REMINDER_FIELDS = ["reminder_type", "reminder_time", "reminder_every_hours", "reminder_text", "reminder_lead_minutes", "reminder_every_minutes"]
SYNC_FIELDS = ["id", "version", "created_at", "updated_at", "deleted_at"]
READ_ONLY = ["id", "created_at", "updated_at", "deleted_at"]


def merged(attrs, instance, field, default=None):
    if field in attrs:
        return attrs[field]
    return getattr(instance, field, default) if instance is not None else default


class OwnedSerializer(serializers.ModelSerializer):
    """Adds `version` (required on update) and checks that referenced
    categories belong to the same user."""

    version = serializers.IntegerField(required=False)

    @property
    def user_id(self):
        return self.context["user_id"]

    def validate_category(self, category):
        if category is not None and (category.user_id != self.user_id or category.deleted_at is not None):
            raise ApiError("category_not_found", 400)
        return category

    def check_schedule(self, attrs, kinds=("none",) + REPEAT_KINDS):
        inst = self.instance
        start, end = merged(attrs, inst, "start_date"), merged(attrs, inst, "end_date")
        if start and end and end < start:
            raise ApiError("end_before_start")
        mode = merged(attrs, inst, "rec_mode", "none")
        if mode not in kinds:
            raise ApiError("invalid_recurrence")
        if mode == "weekdays" and not merged(attrs, inst, "rec_weekdays", 0):
            raise ApiError("weekdays_required")
        # Every N days up to a month, months up to a year, years up to 10.
        limit = {"interval": 30, "monthly": 12, "yearly": 10}.get(mode)
        if limit and not 1 <= (merged(attrs, inst, "rec_interval", 1) or 1) <= limit:
            raise ApiError("invalid_rec_interval")
        if mode in ("monthly", "yearly") and not merged(attrs, inst, "rec_anchor"):
            raise ApiError("rec_anchor_required")
        until = merged(attrs, inst, "rec_until")
        if until and (mode == "none" or (start and until < start)):
            raise ApiError("invalid_rec_until")
        rtype = merged(attrs, inst, "reminder_type", "none")
        if rtype in ("at_time", "repeating") and not merged(attrs, inst, "reminder_time"):
            raise ApiError("reminder_time_required")
        if rtype == "repeating" and not 1 <= (merged(attrs, inst, "reminder_every_hours") or 0) <= 24:
            raise ApiError("reminder_every_hours_invalid")
        if rtype == "countdown" and not (15 <= (merged(attrs, inst, "reminder_lead_minutes") or 0) <= 10080
                                         and 15 <= (merged(attrs, inst, "reminder_every_minutes") or 0) <= 1440):
            raise ApiError("reminder_countdown_invalid")


class CategorySerializer(OwnedSerializer):
    class Meta:
        model = Category
        fields = SYNC_FIELDS + ["name", "color", "sort_order"]
        read_only_fields = READ_ONLY

    def validate_color(self, value):
        if value and not COLOR_RE.match(value):
            raise serializers.ValidationError("#RRGGBB")
        return value

    def validate_name(self, value):
        value = value.strip()
        clash = Category.objects.filter(user_id=self.user_id, name=value, deleted_at__isnull=True)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise ApiError("category_name_taken", 409)
        return value


class TaskSerializer(OwnedSerializer):
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=Category.objects.all(), required=False, allow_null=True)
    origin_task_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Task
        fields = SYNC_FIELDS + ["parent_id", "category_id", "title", "description", "pinned", "sort_order", "start_date", "end_date",
                                "start_time", "end_time"] \
            + RECURRENCE_FIELDS + REMINDER_FIELDS + ["origin_task_id", "origin_date"]
        read_only_fields = READ_ONLY

    def validate_category_id(self, category):
        return self.validate_category(category)

    def validate(self, attrs):
        self.check_schedule(attrs)
        if merged(attrs, self.instance, "reminder_type") == "before_start":
            raise ApiError("invalid_reminder_type")
        if merged(attrs, self.instance, "reminder_type") == "countdown" and merged(attrs, self.instance, "start_time") is None:
            raise ApiError("start_time_required")
        # Same day: the end time can't come before the start time.
        start_time, end_time = merged(attrs, self.instance, "start_time"), merged(attrs, self.instance, "end_time")
        if start_time is not None and end_time is not None and not merged(attrs, self.instance, "end_date") and end_time <= start_time:
            raise ApiError("end_before_start")

        parent_id = merged(attrs, self.instance, "parent_id")
        if parent_id is not None:
            if self.instance is not None and parent_id == self.instance.pk:
                raise ApiError("task.subtask_depth")
            parent = Task.objects.filter(pk=parent_id, user_id=self.user_id, deleted_at__isnull=True).first()
            if parent is None:
                raise ApiError("task.parent_not_found")
            if parent.parent_id is not None:
                raise ApiError("task.subtask_depth")  # one level only
            if self.instance is not None and Task.objects.filter(parent_id=self.instance.pk, deleted_at__isnull=True).exists():
                raise ApiError("task.subtask_depth")  # a task with subtasks can't become one
            if merged(attrs, self.instance, "rec_mode", "none") != "none":
                raise ApiError("task.subtask_recurring")
        origin = attrs.get("origin_task_id")
        if origin and not Task.objects.filter(pk=origin, user_id=self.user_id).exists():
            raise ApiError("task.origin_not_found")
        return attrs


class HabitSerializer(OwnedSerializer):
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=Category.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Habit
        fields = SYNC_FIELDS + ["category_id", "title", "start_date", "end_date", "sort_order", "tracker"] + RECURRENCE_FIELDS + REMINDER_FIELDS
        read_only_fields = READ_ONLY

    def validate_category_id(self, category):
        return self.validate_category(category)

    def validate_tracker(self, t):
        """None, a counter (target 1-999 or none) or a timer (up, or down from 1-600 minutes)."""
        if t is None:
            return None
        if not isinstance(t, dict):
            raise ApiError("invalid_tracker")
        if t.get("kind") == "counter":
            target = t.get("target")
            if target is not None and not (isinstance(target, int) and 1 <= target <= 999):
                raise ApiError("invalid_tracker")
            return {"kind": "counter", "target": target}
        if t.get("kind") == "timer" and t.get("mode") in ("up", "down"):
            minutes = t.get("minutes")
            if t["mode"] == "down" and not (isinstance(minutes, int) and 1 <= minutes <= 600):
                raise ApiError("invalid_tracker")
            return {"kind": "timer", "mode": t["mode"], "minutes": minutes if t["mode"] == "down" else None}
        raise ApiError("invalid_tracker")

    def validate(self, attrs):
        if self.instance is None and "rec_mode" not in attrs:
            attrs["rec_mode"] = "interval"
        self.check_schedule(attrs, kinds=REPEAT_KINDS)
        if merged(attrs, self.instance, "reminder_type") in ("before_start", "countdown"):
            raise ApiError("invalid_reminder_type")
        return attrs


class EventSerializer(OwnedSerializer):
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=Category.objects.all(), required=False, allow_null=True)
    origin_event_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Event
        fields = SYNC_FIELDS + ["category_id", "title", "description", "start_date", "end_date", "all_day", "start_time", "end_time"] \
            + RECURRENCE_FIELDS + REMINDER_FIELDS + ["reminder_minutes_before", "origin_event_id", "origin_date"]
        read_only_fields = READ_ONLY

    def validate_category_id(self, category):
        return self.validate_category(category)

    def validate(self, attrs):
        self.check_schedule(attrs)
        inst = self.instance
        all_day = merged(attrs, inst, "all_day", True)
        start_time, end_time = merged(attrs, inst, "start_time"), merged(attrs, inst, "end_time")
        if all_day:
            attrs["start_time"] = attrs["end_time"] = None
        elif start_time is None:
            raise ApiError("start_time_required")
        elif end_time is not None and not merged(attrs, inst, "end_date") and end_time <= start_time:
            raise ApiError("end_before_start")
        if merged(attrs, inst, "reminder_type") == "before_start":
            minutes = merged(attrs, inst, "reminder_minutes_before")
            if all_day or minutes is None or minutes > 10080:
                raise ApiError("invalid_reminder_minutes")
        if merged(attrs, inst, "reminder_type") == "countdown" and all_day:
            raise ApiError("start_time_required")
        origin = attrs.get("origin_event_id")
        if origin and not Event.objects.filter(pk=origin, user_id=self.user_id).exists():
            raise ApiError("event.origin_not_found")
        return attrs


class OccurrenceSerializer(serializers.ModelSerializer):
    task_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = TaskOccurrence
        fields = ["task_id", "occurrence_date", "status", "completed_at", "version", "updated_at"]


class HabitLogSerializer(serializers.ModelSerializer):
    habit_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = HabitLog
        fields = ["habit_id", "log_date", "status", "value", "version", "updated_at"]


class StatusSerializer(serializers.Serializer):
    status = serializers.CharField(max_length=10)
    version = serializers.IntegerField(required=False)
