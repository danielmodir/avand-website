"""toojibee_notifications: where to deliver reminders and what was
already delivered. What to remind and when is defined by each module's
own rows (e.g. planning Task.reminder_*). Inactive until the app exists
(core Module 'notifications' has is_active = False)."""
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.common.ids import uuid7


class PushSubscription(models.Model):
    class Platform(models.TextChoices):
        WEB = "web"
        ANDROID = "android"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user_id = models.UUIDField()
    platform = models.CharField(max_length=10, choices=Platform.choices)
    provider = models.CharField(max_length=30, help_text="webpush, or the chosen Android push service")
    token = models.TextField(help_text="Endpoint URL / device token")
    token_hash = models.CharField(max_length=64, unique=True)
    web_p256dh = models.CharField(max_length=255, blank=True)
    web_auth = models.CharField(max_length=255, blank=True)
    device_name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    last_seen_at = models.DateTimeField(default=timezone.now)
    revoked_at = models.DateTimeField(null=True, blank=True, help_text="Set when the provider reports the token gone.")

    class Meta:
        indexes = [models.Index(fields=["user_id", "revoked_at"], name="notif_sub_user_idx")]
        constraints = [
            models.CheckConstraint(condition=~Q(platform="web") | (~Q(web_p256dh="") & ~Q(web_auth="")), name="notif_sub_web_keys_ck"),
        ]


class NotificationPreference(models.Model):
    user_id = models.UUIDField(primary_key=True)
    quiet_start = models.TimeField(null=True, blank=True, help_text="Local time in the user's timezone.")
    quiet_end = models.TimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(quiet_start__isnull=True, quiet_end__isnull=True) | Q(quiet_start__isnull=False, quiet_end__isnull=False),
                name="notif_pref_quiet_ck",
            ),
        ]


class NotificationMute(models.Model):
    user_id = models.UUIDField()
    module_key = models.CharField(max_length=40)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user_id", "module_key"], name="notif_mute_uq")]


class ScheduledPush(models.Model):
    """A reminder the app worked out (js/core/notify.js) and handed over, to
    be pushed when due by the send_push command (every minute). PUT
    /notifications/schedule replaces the user's unsent rows; a slot already
    sent is never sent again."""

    user_id = models.UUIDField()
    slot = models.CharField(max_length=200)
    due_at = models.DateTimeField()
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=300, blank=True)
    data = models.JSONField(default=dict)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user_id", "slot"], name="notif_push_slot_uq")]
        indexes = [models.Index(fields=["sent_at", "due_at"], name="notif_push_due_idx")]


class NotificationLog(models.Model):
    """Every reminder queued. The unique key makes sending idempotent: a
    scheduler that runs twice cannot notify twice. Purged after 30 days."""

    class Status(models.TextChoices):
        QUEUED = "queued"
        SENT = "sent"
        FAILED = "failed"
        SKIPPED = "skipped"

    user_id = models.UUIDField()
    source_module = models.CharField(max_length=40)
    source_type = models.CharField(max_length=40)
    source_id = models.UUIDField()
    occurrence_date = models.DateField(null=True, blank=True)
    scheduled_for = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["source_module", "source_type", "source_id", "scheduled_for"], name="notif_log_once_uq"),
        ]
        indexes = [
            models.Index(fields=["status", "scheduled_for"], name="notif_log_queue_idx"),
            models.Index(fields=["user_id", "created_at"], name="notif_log_user_idx"),
        ]
