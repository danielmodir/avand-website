"""toojibee_planning: categories, tasks (one level of subtasks), habits,
events, and one completion row per day.

Recurrence: rec_weekdays is a 7-bit mask, bit 0 = Sunday … bit 6 =
Saturday (JavaScript's Date.getDay() order).
Editing a recurring item:
  "only this day"      -> an *Exception row for that date + a new
                          standalone row whose origin_* points back
  "this and following" -> rec_until on the old row, a new row from then
  "all"                -> update the row itself
"""
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.common.models import UserOwnedSyncModel


class RecurrenceMode(models.TextChoices):
    NONE = "none"
    INTERVAL = "interval"  # every N days
    WEEKDAYS = "weekdays"  # chosen days of the week
    MONTHLY = "monthly"    # rec_anchor's day of the month, every N months
    YEARLY = "yearly"      # rec_anchor's day and month, every N years


class RecurrenceCalendar(models.TextChoices):
    """The calendar a monthly/yearly repeat counts months in."""
    JALALI = "jalali"
    GREGORIAN = "gregorian"
    HIJRI = "hijri"


class ReminderType(models.TextChoices):
    NONE = "none"
    AT_TIME = "at_time"
    REPEATING = "repeating"
    BEFORE_START = "before_start"  # events only
    # Over and over before the start: from reminder_lead_minutes before it,
    # every reminder_every_minutes, until it starts. Tasks and events with a
    # time of day.
    COUNTDOWN = "countdown"


class Recurrence(models.Model):
    rec_mode = models.CharField(max_length=10, choices=RecurrenceMode.choices, default=RecurrenceMode.NONE)
    rec_interval = models.PositiveSmallIntegerField(default=1)
    rec_weekdays = models.PositiveSmallIntegerField(default=0)
    rec_until = models.DateField(null=True, blank=True)
    # Monthly/yearly: the day picked (its day of month, and month for
    # yearly, in rec_calendar) — counting starts from its month/year.
    rec_anchor = models.DateField(null=True, blank=True)
    rec_calendar = models.CharField(max_length=10, choices=RecurrenceCalendar.choices, default=RecurrenceCalendar.JALALI)

    class Meta:
        abstract = True


class Reminder(models.Model):
    reminder_type = models.CharField(max_length=15, choices=ReminderType.choices, default=ReminderType.NONE)
    reminder_time = models.TimeField(null=True, blank=True)
    reminder_every_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    reminder_text = models.CharField(max_length=200, blank=True)
    reminder_lead_minutes = models.PositiveIntegerField(null=True, blank=True)
    reminder_every_minutes = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        abstract = True


def _common_checks(prefix, allow_none_recurrence=True):
    checks = [
        models.CheckConstraint(condition=~Q(title=""), name=f"{prefix}_title_ck"),
        models.CheckConstraint(condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")), name=f"{prefix}_range_ck"),
        models.CheckConstraint(condition=Q(rec_interval__gte=1, rec_interval__lte=365), name=f"{prefix}_interval_ck"),
        models.CheckConstraint(
            condition=Q(rec_weekdays__lte=127) & (~Q(rec_mode="weekdays") | Q(rec_weekdays__gt=0)),
            name=f"{prefix}_weekdays_ck",
        ),
        models.CheckConstraint(
            condition=(
                Q(reminder_type="none")
                | Q(reminder_type="at_time", reminder_time__isnull=False)
                | Q(reminder_type="repeating", reminder_time__isnull=False, reminder_every_hours__gte=1, reminder_every_hours__lte=24)
                | Q(reminder_type="before_start")
                | Q(reminder_type="countdown", reminder_lead_minutes__gte=15, reminder_lead_minutes__lte=10080,
                    reminder_every_minutes__gte=15, reminder_every_minutes__lte=1440)
            ),
            name=f"{prefix}_reminder_ck",
        ),
    ]
    if allow_none_recurrence:
        checks.append(models.CheckConstraint(
            condition=Q(rec_until__isnull=True) | (~Q(rec_mode="none") & Q(rec_until__gte=F("start_date"))),
            name=f"{prefix}_until_ck",
        ))
    return checks


class Category(UserOwnedSyncModel):
    name = models.CharField(max_length=40)
    color = models.CharField(max_length=7, blank=True)
    sort_order = models.IntegerField(default=0)

    class Meta(UserOwnedSyncModel.Meta):
        verbose_name_plural = "categories"
        constraints = [models.CheckConstraint(condition=~Q(name=""), name="planning_category_name_ck")]

    def __str__(self):
        return self.name


class Task(UserOwnedSyncModel, Recurrence, Reminder):
    """A subtask is a task with parent set: same fields and behavior, one
    level deep, never recurring on its own (enforced in serializers.py).
    Completion is never stored here: see TaskOccurrence."""

    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="subtasks")
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    pinned = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True, help_text="Deadline; empty = single day.")
    # Optional time of day: when to start, and (only if set) by when to
    # finish. Once it has passed an unticked task counts as not done.
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    origin_task = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    origin_date = models.DateField(null=True, blank=True)

    class Meta(UserOwnedSyncModel.Meta):
        indexes = UserOwnedSyncModel.Meta.indexes + [models.Index(fields=["user_id", "start_date"], name="planning_task_date_idx")]
        constraints = _common_checks("planning_task") + [
            models.CheckConstraint(condition=~Q(reminder_type="before_start"), name="planning_task_reminder_kind_ck"),
            models.CheckConstraint(condition=~Q(reminder_type="countdown") | Q(start_time__isnull=False), name="planning_task_countdown_ck"),
        ]

    def __str__(self):
        return self.title


class TaskOccurrence(models.Model):
    """Done / not done for one day of a task. 'pending' = cleared again;
    kept as a row (not deleted) so other devices see the change."""

    class Status(models.TextChoices):
        PENDING = "pending"
        DONE = "done"
        NOT_DONE = "not_done"

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="occurrences")
    occurrence_date = models.DateField()
    user_id = models.UUIDField()
    status = models.CharField(max_length=10, choices=Status.choices)
    completed_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["task", "occurrence_date"], name="planning_occurrence_uq"),
            models.CheckConstraint(
                condition=(Q(status="done") & Q(completed_at__isnull=False)) | (~Q(status="done") & Q(completed_at__isnull=True)),
                name="planning_occurrence_done_ck",
            ),
        ]
        indexes = [
            models.Index(fields=["user_id", "occurrence_date"], name="planning_occurrence_day_idx"),
            models.Index(fields=["user_id", "updated_at"], name="planning_occurrence_sync"),
        ]


class TaskException(models.Model):
    """A day removed from a recurring task's series (deleted_at undoes it)."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="exceptions")
    occurrence_date = models.DateField()
    user_id = models.UUIDField()
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["task", "occurrence_date"], name="planning_task_exception_uq")]
        indexes = [models.Index(fields=["user_id", "updated_at"], name="planning_task_exception_sync")]


class TaskAttachment(models.Model):
    """A photo on a task; file_id is core.StoredFile.id (other database).
    At most 3 live photos per task (serializers.py)."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    file_id = models.UUIDField()
    user_id = models.UUIDField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["task", "file_id"], name="planning_attachment_uq")]
        indexes = [
            models.Index(fields=["user_id", "updated_at"], name="planning_attachment_sync"),
            models.Index(fields=["file_id"], name="planning_attachment_file_idx"),
        ]


class Habit(UserOwnedSyncModel, Recurrence, Reminder):
    """Habits always repeat, so rec_mode is never 'none'."""

    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    title = models.CharField(max_length=300)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    sort_order = models.IntegerField(default=0)
    # Counter or timer (the app's habit form): {"kind": "counter", "target": N | null}
    # or {"kind": "timer", "mode": "up" | "down", "minutes": N}; null = a plain tick.
    tracker = models.JSONField(null=True, blank=True)

    class Meta(UserOwnedSyncModel.Meta):
        constraints = _common_checks("planning_habit", allow_none_recurrence=False) + [
            models.CheckConstraint(condition=~Q(rec_mode="none"), name="planning_habit_recurs_ck"),
            models.CheckConstraint(condition=~Q(reminder_type__in=["before_start", "countdown"]), name="planning_habit_reminder_kind_ck"),
        ]

    def __str__(self):
        return self.title


class HabitLog(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        DONE = "done"
        SKIPPED = "skipped"

    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="logs")
    log_date = models.DateField()
    user_id = models.UUIDField()
    status = models.CharField(max_length=10, choices=Status.choices)
    value = models.PositiveIntegerField(null=True, blank=True)  # counter: times; timer: seconds
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["habit", "log_date"], name="planning_habitlog_uq")]
        indexes = [
            models.Index(fields=["user_id", "log_date"], name="planning_habitlog_day_idx"),
            models.Index(fields=["user_id", "updated_at"], name="planning_habitlog_sync"),
        ]


class Event(UserOwnedSyncModel, Recurrence, Reminder):
    """Events may have a time of day (all_day False) and a reminder
    relative to their start ('before_start')."""

    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    all_day = models.BooleanField(default=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    reminder_minutes_before = models.PositiveSmallIntegerField(null=True, blank=True)
    origin_event = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    origin_date = models.DateField(null=True, blank=True)

    class Meta(UserOwnedSyncModel.Meta):
        indexes = UserOwnedSyncModel.Meta.indexes + [models.Index(fields=["user_id", "start_date"], name="planning_event_date_idx")]
        constraints = _common_checks("planning_event") + [
            models.CheckConstraint(
                condition=(Q(all_day=True, start_time__isnull=True, end_time__isnull=True))
                | (Q(all_day=False, start_time__isnull=False) & (Q(end_time__isnull=True) | Q(end_date__isnull=False) | Q(end_time__gt=F("start_time")))),
                name="planning_event_time_ck",
            ),
            models.CheckConstraint(
                condition=~Q(reminder_type="before_start") | Q(all_day=False, reminder_minutes_before__lte=10080),
                name="planning_event_before_start_ck",
            ),
            models.CheckConstraint(condition=~Q(reminder_type="countdown") | Q(all_day=False), name="planning_event_countdown_ck"),
        ]

    def __str__(self):
        return self.title


class EventException(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="exceptions")
    occurrence_date = models.DateField()
    user_id = models.UUIDField()
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["event", "occurrence_date"], name="planning_event_exception_uq")]
        indexes = [models.Index(fields=["user_id", "updated_at"], name="planning_event_exception_sync")]
