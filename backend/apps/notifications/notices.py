"""Messages from the team (models.Notice): delivering one to its recipients."""
from django.db import transaction
from django.utils import timezone

from .models import Notice, NoticeRecipient, PushSubscription, ScheduledPush


def send_notice(notice: Notice, user_ids, push: bool = True) -> int:
    """One row per recipient, and a push for those whose browsers are
    subscribed (sent by the send_push command within a minute)."""
    user_ids = list(dict.fromkeys(user_ids))
    with transaction.atomic(using="notifications"):
        NoticeRecipient.objects.bulk_create([NoticeRecipient(notice=notice, user_id=u) for u in user_ids], ignore_conflicts=True)
        notice.recipients = NoticeRecipient.objects.filter(notice=notice).count()
        notice.save(update_fields=["recipients"])
        if push:
            subscribed = set(PushSubscription.objects.filter(user_id__in=user_ids, revoked_at__isnull=True).values_list("user_id", flat=True))
            ScheduledPush.objects.bulk_create([
                ScheduledPush(user_id=u, slot=f"notice|{notice.id.hex}", due_at=timezone.now(), title=notice.title[:160],
                              body=notice.body[:300], data={"kind": "notice", "id": notice.id.hex, "date": ""})
                for u in subscribed
            ], ignore_conflicts=True)
    return notice.recipients


def notices_for(user_id, limit: int = 50):
    rows = NoticeRecipient.objects.filter(user_id=user_id).select_related("notice").order_by("-notice__created_at")[:limit]
    return [{"id": r.notice.id.hex, "title": r.notice.title, "body": r.notice.body,
             "created_at": r.notice.created_at, "seen": r.seen_at is not None} for r in rows]


def mark_seen(user_id, ids=None) -> int:
    qs = NoticeRecipient.objects.filter(user_id=user_id, seen_at__isnull=True)
    if ids is not None:
        qs = qs.filter(notice_id__in=ids)
    return qs.update(seen_at=timezone.now())