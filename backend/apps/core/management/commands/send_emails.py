from django.core.management import BaseCommand

from apps.core.services.email import send_pending


class Command(BaseCommand):
    help = "Send queued emails (run every minute from cron / a timer)."

    def handle(self, *args, **options):
        sent, failed = send_pending()
        self.stdout.write(f"sent={sent} failed={failed}")
