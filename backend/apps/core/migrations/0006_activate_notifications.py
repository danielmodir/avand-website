"""Reminders now reach a closed app (Web Push, apps/notifications), so the
notifications module is switched on."""
from django.db import migrations


def activate(apps, schema_editor):
    apps.get_model("core", "Module").objects.filter(key="notifications").update(is_active=True)


def deactivate(apps, schema_editor):
    apps.get_model("core", "Module").objects.filter(key="notifications").update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [("core", "0005_settings_item_colors")]
    operations = [migrations.RunPython(activate, deactivate)]
