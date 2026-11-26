from django.db import models


class DeskOwner(models.Model):
    user_id = models.UUIDField(primary_key=True)


class DeskRecord(models.Model):
    owner = models.ForeignKey(DeskOwner, on_delete=models.CASCADE)
    kind = models.CharField(max_length=16)
    client_id = models.CharField(max_length=80)
    data = models.JSONField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "kind", "client_id"], name="university_record_once"),
        ]
