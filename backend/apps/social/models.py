"""toojibee_social: connections, invite links and abuse reports.
User ids refer to core.User (separate database, plain columns).
Sharing items between friends, if it comes, will be a new model here."""
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.common.ids import uuid7


class Connection(models.Model):
    """One row per pair of users, user_a < user_b, so a pair can never
    exist twice. requested_by = who sent the request, or who blocked."""

    class Status(models.TextChoices):
        PENDING = "pending"
        ACCEPTED = "accepted"
        BLOCKED = "blocked"

    user_a = models.UUIDField()
    user_b = models.UUIDField()
    status = models.CharField(max_length=10, choices=Status.choices)
    requested_by = models.UUIDField()
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user_a", "user_b"], name="social_connection_pair_uq"),
            models.CheckConstraint(condition=Q(user_a__lt=F("user_b")), name="social_connection_order_ck"),
            models.CheckConstraint(condition=Q(requested_by=F("user_a")) | Q(requested_by=F("user_b")), name="social_connection_requester_ck"),
        ]
        indexes = [
            models.Index(fields=["user_a", "status"], name="social_connection_a_idx"),
            models.Index(fields=["user_b", "status"], name="social_connection_b_idx"),
        ]

    @staticmethod
    def pair(x, y):
        return (x, y) if str(x) < str(y) else (y, x)

    def other(self, me):
        return self.user_b if str(self.user_a) == str(me) else self.user_a


class Invite(models.Model):
    """toojibee.ir/invite/<code>. Random codes (lowercase + digits), not
    derived from the public id, so a link can be revoked and replaced."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    inviter_user_id = models.UUIDField(db_index=True)
    code = models.CharField(max_length=12, unique=True)
    max_uses = models.PositiveSmallIntegerField(null=True, blank=True)
    uses = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(max_uses__isnull=True) | Q(uses__lte=F("max_uses")), name="social_invite_uses_ck")]

    @property
    def is_usable(self):
        now = timezone.now()
        return (self.revoked_at is None and (self.expires_at is None or self.expires_at > now)
                and (self.max_uses is None or self.uses < self.max_uses))


class InviteRedemption(models.Model):
    """Who signed up through which invite; a user is invited only once."""

    invite = models.ForeignKey(Invite, on_delete=models.CASCADE, related_name="redemptions")
    invitee_user_id = models.UUIDField(unique=True)
    redeemed_at = models.DateTimeField(default=timezone.now)


class Report(models.Model):
    """Abuse reports, reviewed by moderators in the admin."""

    class Reason(models.TextChoices):
        SPAM = "spam"
        HARASSMENT = "harassment"
        IMPERSONATION = "impersonation"
        INAPPROPRIATE = "inappropriate"
        OTHER = "other"

    class Status(models.TextChoices):
        OPEN = "open"
        REVIEWING = "reviewing"
        ACTIONED = "actioned"
        DISMISSED = "dismissed"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    reporter_user_id = models.UUIDField()
    reported_user_id = models.UUIDField(db_index=True)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    details = models.CharField(max_length=1000, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    reviewed_by = models.UUIDField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"], name="social_report_queue_idx"),
            models.Index(fields=["reporter_user_id", "created_at"], name="social_report_reporter_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=~Q(reporter_user_id=F("reported_user_id")), name="social_report_self_ck"),
            models.CheckConstraint(condition=Q(status="open") | Q(reviewed_by__isnull=False), name="social_report_review_ck"),
        ]
