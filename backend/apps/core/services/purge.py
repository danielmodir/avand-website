"""Permanent account deletion across every module database.

Databases are separate, so nothing cascades from core into planning,
period, … . For each account whose 30-day grace period is over, one
UserPurgeTask row per module is created and that module's
purge_user(user_id) runs; the user row (and with it everything in core)
goes last, after every module reported done. Re-running is safe.
"""
import logging

from django.conf import settings
from django.db import transaction
from django.utils.module_loading import import_string

from ..models import EmailOutbox, StoredFile, User, UserPurgeTask
from .accounts import deletion_due_before
from .files import delete_physical

log = logging.getLogger(__name__)


def purge_module_data(user_id, module_key):
    import_string(settings.PURGE_HANDLERS[module_key])(user_id)


def purge_user(user):
    user_id = user.id
    all_done = True
    for module_key in settings.PURGE_HANDLERS:
        task, _ = UserPurgeTask.objects.get_or_create(user_id=user_id, module_key=module_key)
        if task.status == UserPurgeTask.Status.DONE:
            continue
        task.attempts += 1
        try:
            purge_module_data(user_id, module_key)
        except Exception as exc:  # noqa: BLE001 - recorded and retried next run
            log.exception("purge of %s/%s failed", module_key, user_id)
            task.status = UserPurgeTask.Status.FAILED
            task.last_error = str(exc)[:500]
            all_done = False
        else:
            task.status = UserPurgeTask.Status.DONE
            task.last_error = ""
        task.save()
    if not all_done:
        return False

    for stored in StoredFile.objects.filter(owner_id=user_id):
        delete_physical(stored)
    email, lang = user.email, getattr(getattr(user, "settings", None), "language", "fa")
    with transaction.atomic():
        user.delete()  # cascades through every core table
        EmailOutbox.objects.create(to_email=email, template=EmailOutbox.Template.ACCOUNT_DELETED, lang=lang, payload={})
    return True


def purge_due_accounts():
    users = User.objects.filter(status=User.Status.PENDING_DELETION, deletion_requested_at__lte=deletion_due_before())
    done = sum(1 for user in users.iterator() if purge_user(user))
    return done
