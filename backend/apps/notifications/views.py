from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Module
from apps.core.security import sha256_hex

from .models import NotificationMute, NotificationPreference, PushSubscription


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
        return Response({"id": str(sub.id)}, status=status.HTTP_201_CREATED)


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
