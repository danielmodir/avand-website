"""Sends the reminders that are due (ScheduledPush). Run every minute by
cron:  python manage.py send_push
Same rules as backend-php/push-cron.php: claimed before sending (two runs
can't send twice), more than 30 minutes late is skipped, a subscription
the push service calls gone (404/410) is revoked."""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.notifications import webpush
from apps.notifications.models import PushSubscription, ScheduledPush

STALE = timedelta(minutes=30)


class Command(BaseCommand):
    help = "Send due Web Push reminders."

    def handle(self, *args, **opts):
        now = timezone.now()
        ScheduledPush.objects.filter(sent_at__lt=now - timedelta(days=3)).delete()
        with transaction.atomic(using="notifications"):
            due = list(ScheduledPush.objects.select_for_update().filter(sent_at__isnull=True, due_at__lte=now).order_by("due_at")[:300])
            ScheduledPush.objects.filter(id__in=[d.id for d in due]).update(sent_at=now)

        stats = {"due": len(due), "sent": 0, "stale": 0, "failed": 0, "removed": 0}
        subs_by_user = {}
        for item in due:
            if item.due_at < now - STALE:
                stats["stale"] += 1
                continue
            if item.user_id not in subs_by_user:
                subs_by_user[item.user_id] = list(PushSubscription.objects.filter(user_id=item.user_id, platform="web", revoked_at__isnull=True))
            message = {"title": item.title, "body": item.body, "tag": item.slot, "data": item.data}
            for sub in subs_by_user[item.user_id]:
                code = webpush.send(sub, message)
                if 200 <= code < 300:
                    stats["sent"] += 1
                    PushSubscription.objects.filter(id=sub.id).update(last_seen_at=timezone.now())
                elif code in (404, 410):
                    stats["removed"] += 1
                    PushSubscription.objects.filter(id=sub.id).update(revoked_at=timezone.now())
                else:
                    stats["failed"] += 1
        if opts.get("verbosity", 1) > 1 or stats["due"]:
            self.stdout.write(str(stats))
        return None
