from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import ApiError
from apps.planning.models import Event, Task

from .models import DeskOwner, DeskRecord
from .services import KINDS, normalize, prepare_record, transcripts


def owner_state(uid):
    state = {kind: {} for kind in KINDS}
    for kind, client_id, data in (
        DeskRecord.objects.filter(owner_id=uid).order_by("pk").values_list("kind", "client_id", "data")
    ):
        state[kind][client_id] = data
    return state


class StateView(APIView):
    def get(self, request):
        state = owner_state(request.user.id)
        return Response({
            **{kind: list(rows.values()) for kind, rows in state.items()},
            "transcripts": transcripts(state),
        })


class RecordView(APIView):
    def post(self, request, kind):
        uid = request.user.id
        data = normalize(kind, request.data)

        with transaction.atomic(using="university"):
            # Creating the lock row first also serializes competing first writes.
            DeskOwner.objects.get_or_create(user_id=uid)
            DeskOwner.objects.select_for_update().get(user_id=uid)
            state = owner_state(uid)
            record = prepare_record(kind, data, state)
            if kind == "activities":
                item = Task if record["type"] == "assignment" else Event
                try:
                    owned = item.objects.filter(pk=record["itemId"], user_id=uid, deleted_at__isnull=True).exists()
                except ValidationError:
                    owned = False
                if not owned:
                    raise ApiError("not_found", 404)

            if kind == "dossiers" and record["active"]:
                for previous in state["dossiers"].values():
                    if previous["id"] != record["id"] and previous["active"]:
                        previous["active"] = False
                        DeskRecord.objects.filter(owner_id=uid, kind=kind, client_id=previous["id"]).update(data=previous)

            DeskRecord.objects.update_or_create(owner_id=uid, kind=kind, client_id=record["id"], defaults={"data": record})
        return Response(record)
