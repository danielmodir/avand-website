from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("planning", "0011_event_location")]

    operations = [
        migrations.AddField(
            model_name="habit",
            name="goal",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
