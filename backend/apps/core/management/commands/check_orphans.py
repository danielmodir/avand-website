"""Reports rows in module databases whose user no longer exists in core.

Foreign keys can't cross databases, so this is the integrity check that
replaces them. Pass --delete to remove what it finds (normally the purge
job already did; anything found here means a purge was interrupted)."""
from django.apps import apps
from django.core.management import BaseCommand

from apps.core.models import User

USER_OWNED = [
    ("planning.Category", "user_id"), ("planning.Task", "user_id"), ("planning.Habit", "user_id"),
    ("planning.Event", "user_id"), ("period.PeriodUserKey", "user_id"), ("social.Invite", "inviter_user_id"),
    ("notifications.PushSubscription", "user_id"),
]


class Command(BaseCommand):
    help = "Find (and optionally delete) module rows without a core user."

    def add_arguments(self, parser):
        parser.add_argument("--delete", action="store_true")

    def handle(self, *args, **options):
        total = 0
        for label, field in USER_OWNED:
            model = apps.get_model(label)
            owner_ids = set(model.objects.values_list(field, flat=True).distinct())
            existing = set(User.objects.filter(id__in=owner_ids).values_list("id", flat=True))
            orphans = owner_ids - existing
            if orphans:
                total += len(orphans)
                self.stdout.write(f"{label}: {len(orphans)} missing user(s)")
                if options["delete"]:
                    model.objects.filter(**{f"{field}__in": orphans}).delete()
        self.stdout.write(f"orphaned users: {total}")
