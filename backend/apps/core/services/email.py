"""Outgoing email: queued in EmailOutbox, sent by `manage.py send_emails`."""
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from ..models import EmailOutbox

SUBJECTS = {
    "verify_email": {"fa": "تأیید ایمیل توجیبی", "en": "Confirm your Toojibee email"},
    "reset_password": {"fa": "بازیابی رمز توجیبی", "en": "Reset your Toojibee password"},
    "change_email": {"fa": "تأیید ایمیل جدید", "en": "Confirm your new email"},
    "account_deletion_scheduled": {"fa": "حذف حساب توجیبی", "en": "Your Toojibee account will be deleted"},
    "account_deleted": {"fa": "حساب توجیبی حذف شد", "en": "Your Toojibee account was deleted"},
}

BODIES = {
    "verify_email": {
        "fa": "برای تأیید ایمیلت روی این لینک بزن (تا ۲۴ ساعت معتبره):\n{link}",
        "en": "Confirm your email with this link (valid for 24 hours):\n{link}",
    },
    "reset_password": {
        "fa": "برای انتخاب رمز جدید روی این لینک بزن (تا یک ساعت معتبره):\n{link}\nاگه درخواست نداده بودی، این ایمیل رو نادیده بگیر.",
        "en": "Choose a new password with this link (valid for one hour):\n{link}\nIf you didn't ask for this, ignore this email.",
    },
    "change_email": {
        "fa": "برای تأیید ایمیل جدیدت روی این لینک بزن:\n{link}",
        "en": "Confirm your new email address with this link:\n{link}",
    },
    "account_deletion_scheduled": {
        "fa": "حسابت در تاریخ {purge_on} برای همیشه حذف می‌شه. تا اون روز با ورود دوباره می‌تونی منصرف بشی.",
        "en": "Your account will be permanently deleted on {purge_on}. Sign in before then to cancel.",
    },
    "account_deleted": {
        "fa": "حساب و همه‌ی داده‌هات حذف شد.",
        "en": "Your account and all of its data have been deleted.",
    },
}

MAX_ATTEMPTS = 6


def queue_email(user, template, lang, payload=None):
    return EmailOutbox.objects.create(user=user, to_email=user.email, template=template, lang=lang, payload=payload or {})


def render(item):
    lang = item.lang if item.lang in ("fa", "en") else "fa"
    return SUBJECTS[item.template][lang], BODIES[item.template][lang].format(**(item.payload or {}))


def send_pending(limit=100):
    """Sends due emails with exponential backoff. Returns (sent, failed)."""
    sent = failed = 0
    now = timezone.now()
    ids = list(
        EmailOutbox.objects.filter(status=EmailOutbox.Status.PENDING, next_attempt_at__lte=now)
        .order_by("next_attempt_at").values_list("id", flat=True)[:limit]
    )
    for item_id in ids:
        with transaction.atomic():
            item = EmailOutbox.objects.select_for_update(skip_locked=True).filter(id=item_id, status=EmailOutbox.Status.PENDING).first()
            if item is None:
                continue
            item.status = EmailOutbox.Status.SENDING
            item.attempts += 1
            item.save(update_fields=["status", "attempts"])
        try:
            subject, body = render(item)
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [item.to_email])
        except Exception as exc:  # noqa: BLE001 - any delivery error is retried
            item.last_error = str(exc)[:500]
            if item.attempts >= MAX_ATTEMPTS:
                item.status = EmailOutbox.Status.FAILED
                item.payload = None
            else:
                item.status = EmailOutbox.Status.PENDING
                item.next_attempt_at = timezone.now() + timedelta(minutes=2 ** item.attempts)
            item.save(update_fields=["status", "last_error", "next_attempt_at", "payload"])
            failed += 1
        else:
            item.status = EmailOutbox.Status.SENT
            item.sent_at = timezone.now()
            item.payload = None  # drop the one-time link
            item.save(update_fields=["status", "sent_at", "payload"])
            sent += 1
    return sent, failed
