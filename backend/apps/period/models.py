"""toojibee_period: health data. Nothing here is readable without the
master key, which lives outside the database (settings.PERIOD_KEKS).

Envelope encryption (see crypto.py): each user has a random data key
(DEK), stored only wrapped by the master key (KEK). Every enc_data value
is AES-256-GCM under that DEK, bound to its table, row and user.
Deleting a user's PeriodUserKey makes all of their period data
unreadable, including copies in old backups (crypto-shredding).
"""
from django.db import models
from django.utils import timezone

from apps.common.ids import uuid7


class PeriodUserKey(models.Model):
    user_id = models.UUIDField(primary_key=True)
    wrapped_dek = models.BinaryField(max_length=128)
    kek_version = models.PositiveSmallIntegerField(db_index=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    rotated_at = models.DateTimeField(null=True, blank=True)


class PeriodProfile(models.Model):
    """Encrypted JSON: {cycle_length, period_length, quiz_step, show_on_calendar}."""

    key = models.OneToOneField(PeriodUserKey, primary_key=True, on_delete=models.CASCADE, db_column="user_id", related_name="profile")
    enc_data = models.BinaryField(max_length=1024)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)


class PeriodCycle(models.Model):
    """One logged cycle. Encrypted JSON: {start_date, end_date}. Dates are
    encrypted, so sorting happens after decryption (a user has at most a
    few hundred rows)."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    key = models.ForeignKey(PeriodUserKey, on_delete=models.CASCADE, db_column="user_id", related_name="cycles")
    enc_data = models.BinaryField(max_length=512)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["key", "updated_at"], name="period_cycle_sync")]
