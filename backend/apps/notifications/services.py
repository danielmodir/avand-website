from django.db import transaction

from .models import NotificationLog, NotificationMute, NotificationPreference, PushSubscription


def purge_user(user_id):
    with transaction.atomic(using="notifications"):
        for model in (PushSubscription, NotificationPreference, NotificationMute, NotificationLog):
            model.objects.filter(user_id=user_id).delete()
