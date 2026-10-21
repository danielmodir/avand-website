from django.db import transaction

from .models import NotificationLog, NotificationMute, NotificationPreference, PushSubscription, ScheduledPush


def purge_user(user_id):
    with transaction.atomic(using="notifications"):
        for model in (PushSubscription, NotificationPreference, NotificationMute, NotificationLog, ScheduledPush):
            model.objects.filter(user_id=user_id).delete()
