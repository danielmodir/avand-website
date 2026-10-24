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


class LogEntry(serializers.Serializer):
    s = serializers.DateField()
    e = serializers.DateField(required=False, allow_null=True)

    def validate(self, data):
        if data.get("e") and data["e"] < data["s"]:
            raise serializers.ValidationError("end_before_start")
        return {"s": data["s"].isoformat(), "e": data["e"].isoformat() if data.get("e") else None}


class ProfileInput(serializers.Serializer):
    # Wide on purpose: unusual values are kept and the app shows a doctor note.
    cycle_length = serializers.IntegerField(min_value=10, max_value=90, required=False)
    period_length = serializers.IntegerField(min_value=1, max_value=15, required=False)
    quiz_step = serializers.IntegerField(min_value=0, max_value=4, required=False)  # 4 = done
    show_on_calendar = serializers.BooleanField(required=False)
    enabled = serializers.BooleanField(required=False)
    last_start = serializers.DateField(required=False, allow_null=True)
    regular = serializers.ChoiceField(choices=["", "yes", "no", "unsure"], required=False)
    quiz_cycle = serializers.IntegerField(min_value=10, max_value=90, required=False, allow_null=True)
    quiz_period = serializers.IntegerField(min_value=1, max_value=15, required=False, allow_null=True)
    log = serializers.ListField(child=LogEntry(), max_length=24, required=False)
    asked = serializers.DictField(child=serializers.DateField(), required=False)
    remind_days = serializers.IntegerField(min_value=0, max_value=3, required=False)
    version = serializers.IntegerField(min_value=0)

    def validate_asked(self, value):
        if len(value) > 20:
            raise serializers.ValidationError("too_many")
        return {str(k)[:40]: v.isoformat() for k, v in value.items()}

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
