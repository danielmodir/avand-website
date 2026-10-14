"""Retention (run daily):
  sessions expired or revoked > 30 days ago, used/expired email tokens
  core.auth_events > 90 days, notifications.notification_log > 30 days
  soft-deleted planning/period rows > 90 days, deleted files > 30 days
"""
from datetime import timedelta

from django.apps import apps
from django.core.management import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.core.models import AuthEvent, AuthSession, AuthToken, StoredFile
from apps.core.services.files import delete_physical

SOFT_DELETED_MODELS = [
    "planning.Category", "planning.Task", "planning.TaskException", "planning.TaskAttachment",
    "planning.Habit", "planning.Event", "planning.EventException", "period.PeriodCycle",
]


class Command(BaseCommand):
    help = "Delete data past its retention period."

    def handle(self, *args, **options):
        now = timezone.now()
        days = lambda n: now - timedelta(days=n)  # noqa: E731
        counts = {
            "sessions": AuthSession.objects.filter(Q(expires_at__lt=days(30)) | Q(revoked_at__lt=days(30))).delete()[0],
            "auth_tokens": AuthToken.objects.filter(Q(expires_at__lt=days(30)) | Q(used_at__lt=days(30))).delete()[0],
            "auth_events": AuthEvent.objects.filter(created_at__lt=days(90)).delete()[0],
        }
        log = apps.get_model("notifications", "NotificationLog")
        counts["notification_log"] = log.objects.filter(created_at__lt=days(30)).delete()[0]
        for label in SOFT_DELETED_MODELS:
            model = apps.get_model(label)
            counts[label] = model.objects.filter(deleted_at__lt=days(90)).delete()[0]
        old_files = StoredFile.objects.filter(deleted_at__lt=days(30))
        for stored in old_files:
            delete_physical(stored)
        counts["files"] = old_files.delete()[0]
        self.stdout.write(" ".join(f"{k}={v}" for k, v in counts.items()))
