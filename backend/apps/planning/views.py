from datetime import timedelta

from django.http import Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import parse_day, parse_since
from apps.common.exceptions import ApiError

from . import serializers as s
from . import services
from .models import Category, Event, EventException, Habit, HabitLog, Task, TaskAttachment, TaskException, TaskOccurrence

ITEM_KINDS = {
    "categories": (Category, s.CategorySerializer),
    "tasks": (Task, s.TaskSerializer),
    "habits": (Habit, s.HabitSerializer),
    "events": (Event, s.EventSerializer),
}


# Incremental sync re-sends the last few seconds before since. A write
# stamped in the same clock tick as the previous sync, or committed by a
# transaction that was still open during it, would otherwise be missed
# forever. Duplicates are harmless: applying a row twice is idempotent.
SYNC_OVERLAP = timedelta(seconds=5)


def _rows(model, user_id, since, fields=None, soft_deleted=True):
    qs = model.objects.filter(user_id=user_id)
    if since is not None:
        qs = qs.filter(updated_at__gte=since - SYNC_OVERLAP)
    elif soft_deleted:
        qs = qs.filter(deleted_at__isnull=True)
    return qs.values(*fields) if fields else qs


class SyncView(APIView):
    """GET /planning/sync[?since=<server_time from the previous call>]

    Without `since`: every live row. With it: every row changed since then
    (with a short overlap, see SYNC_OVERLAP), deleted ones included
    (deleted_at set), so a device can apply them.
    """

    def get(self, request):
        server_time = timezone.now()
        since = parse_since(request.query_params.get("since"))
        uid = request.user.id
        ctx = {"user_id": uid}

        def items(kind):
            model, serializer = ITEM_KINDS[kind]
            return serializer(_rows(model, uid, since), many=True, context=ctx).data

        def plain(model, fields, soft_deleted=True):
            return list(_rows(model, uid, since, fields, soft_deleted))

        return Response({
            # Full microsecond precision: the JSON encoder would round this down to
            # milliseconds and make the next ?since= return rows again.
            "server_time": server_time.isoformat(),
            "full": since is None,
            "categories": items("categories"),
            "tasks": items("tasks"),
            "habits": items("habits"),
            "events": items("events"),
            "task_occurrences": plain(TaskOccurrence, ["task_id", "occurrence_date", "status", "completed_at", "version", "updated_at"], soft_deleted=False),
            "task_exceptions": plain(TaskException, ["task_id", "occurrence_date", "deleted_at", "updated_at"]),
            "task_attachments": plain(TaskAttachment, ["task_id", "file_id", "sort_order", "deleted_at", "updated_at"]),
            "habit_logs": plain(HabitLog, ["habit_id", "log_date", "status", "value", "version", "updated_at"], soft_deleted=False),
            "event_exceptions": plain(EventException, ["event_id", "occurrence_date", "deleted_at", "updated_at"]),
        })


class ItemView(APIView):
    """PUT /planning/<kind>/<id> creates or updates; DELETE soft-deletes."""

    def _kind(self, kind):
        if kind not in ITEM_KINDS:
            raise Http404
        return ITEM_KINDS[kind]

    def put(self, request, kind, item_id):
        model, serializer = self._kind(kind)
        data, created = services.upsert(model, serializer, request.user.id, item_id, request.data)
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, kind, item_id):
        model, _ = self._kind(kind)
        services.soft_delete(model, request.user.id, item_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskOccurrenceView(APIView):
    def put(self, request, task_id, day):
        task = services.owned_or_404(Task, request.user.id, task_id)
        row = services.set_status(
            TaskOccurrence, "task", task, parse_day(day), request.data.get("status"), request.user.id,
            TaskOccurrence.Status.values, TaskOccurrence.Status.DONE,
        )
        return Response(s.OccurrenceSerializer(row).data)


def habit_log_value(data):
    """A counter's count or a timer's seconds for the day (absent = unchanged)."""
    if "value" not in data:
        return services.UNCHANGED
    v = data["value"]
    if v is None:
        return None
    if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 999_999:
        raise ApiError("invalid_value")
    return v


class HabitLogView(APIView):
    def put(self, request, habit_id, day):
        habit = services.owned_or_404(Habit, request.user.id, habit_id)
        row = services.set_status(
            HabitLog, "habit", habit, parse_day(day), request.data.get("status"), request.user.id,
            HabitLog.Status.values, HabitLog.Status.DONE, value=habit_log_value(request.data),
        )
        return Response(s.HabitLogSerializer(row).data)


class ExceptionView(APIView):
    """PUT removes one day from a recurring task/event; DELETE restores it."""

    MODELS = {"tasks": (Task, TaskException, "task"), "events": (Event, EventException, "event")}

    def _apply(self, request, kind, item_id, day, present):
        if kind not in self.MODELS:
            raise Http404
        parent_model, model, field = self.MODELS[kind]
        parent = services.owned_or_404(parent_model, request.user.id, item_id)
        services.set_exception(model, field, parent, parse_day(day), request.user.id, present)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def put(self, request, kind, item_id, day):
        return self._apply(request, kind, item_id, day, True)

    def delete(self, request, kind, item_id, day):
        return self._apply(request, kind, item_id, day, False)


class AttachmentView(APIView):
    def put(self, request, task_id, file_id):
        task = services.owned_or_404(Task, request.user.id, task_id)
        row = services.attach_file(task, file_id, request.user.id)
        return Response({"task_id": str(task.id), "file_id": str(row.file_id), "sort_order": row.sort_order})

    def delete(self, request, task_id, file_id):
        task = services.owned_or_404(Task, request.user.id, task_id)
        updated = TaskAttachment.objects.filter(task=task, file_id=file_id, deleted_at__isnull=True).update(deleted_at=timezone.now())
        if not updated:
            raise ApiError("not_found", 404)
        return Response(status=status.HTTP_204_NO_CONTENT)
