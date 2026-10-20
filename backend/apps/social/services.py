"""Connection state machine. Every change locks the pair's row inside a
transaction, so two people acting at once can't leave it inconsistent."""
import secrets
import string

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import ApiError

from .models import Connection, Invite, InviteRedemption, Report

DB = "social"
CODE_ALPHABET = string.ascii_lowercase + string.digits


def _lock_pair(me, other):
    a, b = Connection.pair(me, other)
    return a, b, Connection.objects.select_for_update().filter(user_a=a, user_b=b).first()


def perspective(row, me):
    """Status in the client's vocabulary."""
    mine = str(row.requested_by) == str(me)
    if row.status == Connection.Status.PENDING:
        return "pending-outgoing" if mine else "pending-incoming"
    if row.status == Connection.Status.BLOCKED:
        return "blocked" if mine else "blocked-by-them"
    return row.status


def is_blocked_between(x, y):
    a, b = Connection.pair(x, y)
    return Connection.objects.filter(user_a=a, user_b=b, status=Connection.Status.BLOCKED).exists()


def send_request(me, other):
    with transaction.atomic(using=DB):
        a, b, row = _lock_pair(me, other)
        if row is None:
            Connection.objects.create(user_a=a, user_b=b, status=Connection.Status.PENDING, requested_by=me)
        elif row.status == Connection.Status.PENDING and str(row.requested_by) != str(me):
            # They already asked me: asking back means yes.
            row.status, row.responded_at = Connection.Status.ACCEPTED, timezone.now()
            row.save()
        elif row.status == Connection.Status.BLOCKED:
            raise ApiError("user_not_found", 404)  # never reveal a block


def respond(me, other, accept):
    with transaction.atomic(using=DB):
        _, _, row = _lock_pair(me, other)
        if row is None or row.status != Connection.Status.PENDING or str(row.requested_by) == str(me):
            raise ApiError("no_pending_request", 404)
        if accept:
            row.status, row.responded_at = Connection.Status.ACCEPTED, timezone.now()
            row.save()
        else:
            row.delete()


def remove(me, other):
    """Unfriend, cancel my request or decline theirs (never lifts a block)."""
    a, b = Connection.pair(me, other)
    Connection.objects.filter(user_a=a, user_b=b).exclude(status=Connection.Status.BLOCKED).delete()


def block(me, other):
    with transaction.atomic(using=DB):
        a, b, row = _lock_pair(me, other)
        if row is None:
            Connection.objects.create(user_a=a, user_b=b, status=Connection.Status.BLOCKED, requested_by=me)
        elif not (row.status == Connection.Status.BLOCKED and str(row.requested_by) != str(me)):
            row.status, row.requested_by = Connection.Status.BLOCKED, me
            row.save()


def unblock(me, other):
    a, b = Connection.pair(me, other)
    Connection.objects.filter(user_a=a, user_b=b, status=Connection.Status.BLOCKED, requested_by=me).delete()


def create_invite(me, max_uses=None):
    for _ in range(5):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
        if not Invite.objects.filter(code=code).exists():
            return Invite.objects.create(inviter_user_id=me, code=code, max_uses=max_uses)
    raise ApiError("try_again", 503)


def redeem_invite(me, code):
    """Someone opened an invite link: they and the inviter are friends at
    once (sharing the link was the inviter's yes). Opening it again is
    harmless. A block between the two still wins, without saying so."""
    with transaction.atomic(using=DB):
        invite = Invite.objects.select_for_update().filter(code=code).first()
        if invite is None or not invite.is_usable or str(invite.inviter_user_id) == str(me):
            raise ApiError("invalid_invite", 404)
        if not InviteRedemption.objects.filter(invite=invite, invitee_user_id=me).exists():
            InviteRedemption.objects.create(invite=invite, invitee_user_id=me)
            invite.uses += 1
            invite.save(update_fields=["uses"])
        a, b, row = _lock_pair(me, invite.inviter_user_id)
        if row is None:
            Connection.objects.create(user_a=a, user_b=b, status=Connection.Status.ACCEPTED, requested_by=invite.inviter_user_id,
                                      responded_at=timezone.now())
        elif row.status == Connection.Status.BLOCKED:
            raise ApiError("invalid_invite", 404)
        elif row.status == Connection.Status.PENDING:
            row.status, row.responded_at = Connection.Status.ACCEPTED, timezone.now()
            row.save()
    return invite


def file_report(me, other, reason, details):
    if Report.objects.filter(reporter_user_id=me, reported_user_id=other, status=Report.Status.OPEN).exists():
        return None  # one open report per pair is enough
    return Report.objects.create(reporter_user_id=me, reported_user_id=other, reason=reason, details=details[:1000])


def purge_user(user_id):
    with transaction.atomic(using=DB):
        Connection.objects.filter(user_a=user_id).delete()
        Connection.objects.filter(user_b=user_id).delete()
        InviteRedemption.objects.filter(invitee_user_id=user_id).delete()
        Invite.objects.filter(inviter_user_id=user_id).delete()
        Report.objects.filter(reporter_user_id=user_id, status=Report.Status.OPEN).delete()
