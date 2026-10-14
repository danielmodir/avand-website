from django.core.management import BaseCommand

from apps.calendar_data.loaders import HIJRI_FILE, OCCASIONS_FILE, load_hijri_months, load_occasions
from apps.calendar_data.models import HijriMonthStart, Occasion
from apps.calendar_data.services import clear_cache


class Command(BaseCommand):
    help = "Import occasions (BaseMax dataset format) and official Hijri month starts. Safe to re-run."

    def add_arguments(self, parser):
        parser.add_argument("--occasions", default=str(OCCASIONS_FILE))
        parser.add_argument("--hijri-months", default=str(HIJRI_FILE))

    def handle(self, *args, **options):
        n_occ = load_occasions(Occasion, options["occasions"])
        n_hijri = load_hijri_months(HijriMonthStart, options["hijri_months"])
        clear_cache()
        self.stdout.write(f"occasions={n_occ} hijri_months={n_hijri}")
