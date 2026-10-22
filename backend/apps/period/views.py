from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import parse_since

from . import services


class PeriodEligible(BasePermission):
    """The period desktop exists only for users whose profile says female."""

    message = "module_not_available"

    def has_permission(self, request, view):
        profile = getattr(request.user, "profile", None)
        return bool(request.user and profile and profile.gender == "female")


class ProfileInput(serializers.Serializer):
    cycle_length = serializers.IntegerField(min_value=18, max_value=60, required=False)
    period_length = serializers.IntegerField(min_value=1, max_value=15, required=False)
    quiz_step = serializers.IntegerField(min_value=0, max_value=4, required=False)  # 4 = done
    show_on_calendar = serializers.BooleanField(required=False)
    enabled = serializers.BooleanField(required=False)
    last_start = serializers.DateField(required=False, allow_null=True)
    version = serializers.IntegerField(min_value=0)

    def validate_last_start(self, value):
        return value.isoformat() if value else None  # stored inside encrypted JSON


class PeriodView(APIView):
    def get_permissions(self):
        return super().get_permissions() + [PeriodEligible()]


class ProfileView(PeriodView):
    def get(self, request):
        return Response(services.read_profile(request.user.id))

    def put(self, request):
        data = ProfileInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        version = v.pop("version")
        return Response(services.write_profile(request.user.id, v, version))


class CycleListView(PeriodView):
    def get(self, request):
        return Response(services.list_cycles(request.user.id, parse_since(request.query_params.get("since"))))


class CycleDetailView(PeriodView):
    def put(self, request, cycle_id):
        data, created = services.upsert_cycle(request.user.id, cycle_id, request.data)
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, cycle_id):
        services.delete_cycle(request.user.id, cycle_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PredictionsView(PeriodView):
    def get(self, request):
        return Response(services.predictions(request.user.id))
