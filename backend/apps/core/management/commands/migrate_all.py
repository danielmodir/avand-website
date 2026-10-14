"""`migrate` for every module database, core first (its post-migrate step
creates the permissions and admin roles for all apps)."""
from django.conf import settings
from django.core.management import BaseCommand, call_command


class Command(BaseCommand):
    help = "Apply migrations to every module database."

    def handle(self, *args, **options):
        for alias in ["default"] + [a for a in settings.DATABASES if a != "default"]:
            self.stdout.write(self.style.MIGRATE_HEADING(f"== {alias} ({settings.DATABASES[alias]['NAME']})"))
            call_command("migrate", database=alias, interactive=False, verbosity=options["verbosity"])
