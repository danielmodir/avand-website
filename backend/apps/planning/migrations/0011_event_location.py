from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("planning", "0010_event_visibility"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="location",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="event",
            name="meeting_url",
            field=models.URLField(blank=True, default="", max_length=2048),
        ),
    ]
