"""Rows the app cannot run without: the module registry and the About text
placeholders (empty body = use the app's built-in default)."""
from django.db import migrations

MODULES = [
    # key, kind, name_fa, name_en, description_fa, description_en, database_alias, eligibility, default_enabled, is_active, sort_order
    ("occasions", "desktop", "مناسبت‌ها", "Occasions", "مناسبت‌ها و تعطیلات روز", "Today's occasions and holidays", "calendar", "everyone", True, True, 10),
    ("planning", "desktop", "برنامه‌ریزی", "Planning", "کارها، عادت‌ها و رویدادها", "Tasks, habits and events", "planning", "everyone", True, True, 20),
    ("period", "desktop", "پریود", "Period", "پیگیری و پیش‌بینی دوره", "Cycle tracking and prediction", "period", "gender_female", False, True, 30),
    ("social", "feature", "ارتباط‌ها", "Connections", "دوستان و دعوت", "Friends and invites", "social", "everyone", True, True, 40),
    ("notifications", "feature", "اعلان‌ها", "Notifications", "یادآورها روی گوشی و مرورگر", "Reminders on phone and browser", "notifications", "everyone", True, False, 50),
]
FIELDS = ["kind", "name_fa", "name_en", "description_fa", "description_en", "database_alias", "eligibility", "default_enabled", "is_active", "sort_order"]


def forwards(apps, schema_editor):
    Module = apps.get_model("core", "Module")
    AppContent = apps.get_model("core", "AppContent")
    for key, *values in MODULES:
        Module.objects.update_or_create(key=key, defaults=dict(zip(FIELDS, values)))
    for lang in ("fa", "en"):
        AppContent.objects.get_or_create(content_key="about", lang=lang, defaults={"body": ""})


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
