from django.core.management import BaseCommand

from apps.core.services.purge import purge_due_accounts


class Command(BaseCommand):
    help = "Permanently delete accounts whose 30-day grace period is over (run daily)."

    def handle(self, *args, **options):
        self.stdout.write(f"purged={purge_due_accounts()}")
