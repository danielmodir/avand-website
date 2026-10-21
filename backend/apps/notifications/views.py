import re
from datetime import datetime, timedelta, timezone as dt_timezone

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Module
from apps.core.security import sha256_hex

from . import webpush
from .models import NotificationMute, NotificationPreference, PushSubscription, ScheduledPush

MAX_SUBSCRIPTIONS = 10
MAX_SCHEDULED = 400
STALE = timedelta(minutes=30)


class NotificationsActive(BasePermission):
    message = "module_not_available"

    def has_permission(self, request, view):
        return Module.objects.filter(key="notifications", is_active=True).exists()


class SubscriptionInput(serializers.Serializer):
    platform = serializers.ChoiceField(choices=PushSubscription.Platform.choices)
    provider = serializers.CharField(max_length=30)
    token = serializers.CharField(max_length=2000)
    web_p256dh = serializers.CharField(max_length=255, required=False, allow_blank=True)
    web_auth = serializers.CharField(max_length=255, required=False, allow_blank=True)
    device_name = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate(self, data):
        if data["platform"] == "web":
            if not webpush.endpoint_allowed(data["token"]) or not data.get("web_p256dh") or not data.get("web_auth"):
                raise serializers.ValidationError("invalid_web_subscription")
        return data


class NotificationsView(APIView):
    def get_permissions(self):
        return super().get_permissions() + [NotificationsActive()]


class SubscriptionListView(NotificationsView):
    def post(self, request):
        data = SubscriptionInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        sub, _ = PushSubscription.objects.update_or_create(
            token_hash=sha256_hex(v["token"]),
            defaults={**v, "user_id": request.user.id, "last_seen_at": timezone.now(), "revoked_at": None},
        )
        # Oldest devices beyond the limit stop getting reminders.
        live = PushSubscription.objects.filter(user_id=request.user.id, revoked_at__isnull=True).order_by("-last_seen_at")
        old = list(live.values_list("id", flat=True)[MAX_SUBSCRIPTIONS:])
        if old:
            PushSubscription.objects.filter(id__in=old).update(revoked_at=timezone.now())
        return Response({"id": str(sub.id)}, status=status.HTTP_201_CREATED)


class PushKeyView(APIView):
    """The server's public VAPID key, for pushManager.subscribe()."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"public_key": webpush.vapid_keys()[1]})


class ScheduleView(NotificationsView):
    """PUT {items: [{slot, at (ms), title, body, kind, id, date}]}: replaces
    the user's reminders that haven't been sent yet."""

    def put(self, request):
        items = request.data.get("items")
        items = items[:MAX_SCHEDULED] if isinstance(items, list) else []
        now = timezone.now()
        rows = {}
        for it in items:
            if not isinstance(it, dict) or not isinstance(it.get("slot"), str) or not it["slot"].strip():
                continue
            try:
                due = datetime.fromtimestamp(float(it.get("at")) / 1000, tz=dt_timezone.utc)
            except (TypeError, ValueError, OverflowError, OSError):
                continue
            if due < now - STALE or due > now + timedelta(days=8):
                continue
            date = str(it.get("date") or "")
            slot = it["slot"].strip()[:200]
            rows[slot] = ScheduledPush(
                user_id=request.user.id, slot=slot, due_at=due,
                title=str(it.get("title") or "")[:160], body=str(it.get("body") or "")[:300],
                data={"kind": str(it.get("kind") or "")[:10], "id": str(it.get("id") or "")[:64],
                      "date": date if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) else ""},
            )
        with transaction.atomic(using="notifications"):
            ScheduledPush.objects.filter(user_id=request.user.id, sent_at__isnull=True).delete()
            sent = set(ScheduledPush.objects.filter(user_id=request.user.id).values_list("slot", flat=True))
            fresh = [r for s, r in rows.items() if s not in sent]
            ScheduledPush.objects.bulk_create(fresh)
        return Response({"scheduled": len(fresh)})


class SubscriptionDetailView(NotificationsView):
    def delete(self, request, sub_id):
        PushSubscription.objects.filter(id=sub_id, user_id=request.user.id).update(revoked_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferenceView(NotificationsView):
    def get(self, request):
        pref = NotificationPreference.objects.filter(user_id=request.user.id).first()
        mutes = list(NotificationMute.objects.filter(user_id=request.user.id).values_list("module_key", flat=True))
        return Response({"quiet_start": pref.quiet_start if pref else None, "quiet_end": pref.quiet_end if pref else None, "muted_modules": mutes})

    def put(self, request):
        start, end = request.data.get("quiet_start"), request.data.get("quiet_end")
        field = serializers.TimeField(allow_null=True)
        pref, _ = NotificationPreference.objects.update_or_create(
            user_id=request.user.id,
            defaults={"quiet_start": field.run_validation(start), "quiet_end": field.run_validation(end)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MuteView(NotificationsView):
    def put(self, request, module_key):
        NotificationMute.objects.get_or_create(user_id=request.user.id, module_key=module_key)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, module_key):
        NotificationMute.objects.filter(user_id=request.user.id, module_key=module_key).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
