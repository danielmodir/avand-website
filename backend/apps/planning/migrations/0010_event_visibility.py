from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("planning", "0009_reminder_window"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="show_in_planning",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="event",
            name="show_in_occasions",
            field=models.BooleanField(default=True),
        ),
    ]
