"""Bundled reference data: the open occasions dataset and Iran's official
Hijri month starts for 1405 SH. Later years: `manage.py load_calendar_data`
or the admin."""
from django.db import migrations

from apps.calendar_data.loaders import load_hijri_months, load_occasions


def forwards(apps, schema_editor):
    load_occasions(apps.get_model("calendar_data", "Occasion"))
    load_hijri_months(apps.get_model("calendar_data", "HijriMonthStart"))


class Migration(migrations.Migration):
    dependencies = [("calendar_data", "0001_initial")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
