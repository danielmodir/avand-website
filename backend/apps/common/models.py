"""Abstract model bases used by every module app."""
from django.db import models
from django.utils import timezone

from .ids import uuid7


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UserOwnedSyncModel(TimeStampedModel):
    """A row owned by one user and synced to that user's devices.

    user_id points at core.User in the core database; it is a plain
    column because foreign keys cannot cross databases.
    version is bumped on every write: a client sends the version it last
    saw and the API rejects the write with 409 if it moved meanwhile.
    deleted_at is a tombstone so other devices learn about deletions;
    tombstones are hard-deleted after 90 days (cleanup_expired).
    """

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user_id = models.UUIDField(db_index=False)
    version = models.PositiveIntegerField(default=1)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True
        indexes = [models.Index(fields=["user_id", "updated_at"], name="%(app_label)s_%(class)s_sync")]

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.version += 1
        self.save(update_fields=["deleted_at", "version", "updated_at"])
