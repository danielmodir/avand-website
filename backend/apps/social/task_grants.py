"""Live grants project only task title and notes. Planning retains the source of truth."""
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import ApiError
from apps.planning.models import Task
from .models import Connection, TaskGrant
from .views import _target


class Invitation(serializers.Serializer):
    task_id = serializers.UUIDField()
    recipient = serializers.UUIDField()
    role = serializers.ChoiceField(choices=("viewer", "editor"))


class Changes(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    title = serializers.CharField(max_length=300)
    description = serializers.CharField(max_length=4000, required=False, allow_blank=True)


def tasks():
    return Task.objects.filter(deleted_at__isnull=True, parent__isnull=True)


def view(g, t, me):
    return dict(id=str(g.pk), owner=str(g.owner), recipient=str(g.recipient), mine=g.owner == me,
                role=g.role, task_id=str(t.pk), title=t.title, description=t.description, version=t.version)


class Grants(APIView):
    def get(self, request):
        me = request.user.pk
        grants = list(TaskGrant.objects.filter(Q(owner=me) | Q(recipient=me), connection__status="accepted"))
        items = tasks().in_bulk([g.task_id for g in grants])
        return Response([view(g, items[g.task_id], me) for g in grants
                         if g.task_id in items and items[g.task_id].user_id == g.owner])

    def post(self, request):
        data = Invitation(data=request.data)
        data.is_valid(raise_exception=True)
        d, me = data.validated_data, request.user.pk
        other = _target(request, d["recipient"])
        a, b = Connection.pair(me, other)
        with transaction.atomic(using="social"):
            c = Connection.objects.select_for_update().filter(user_a=a, user_b=b, status="accepted").first()
            t = tasks().filter(pk=d["task_id"], user_id=me).first()
            if not c or not t:
                raise ApiError("not_found", 404)
            g, _ = TaskGrant.objects.update_or_create(owner=me, recipient=other, task_id=t.pk,
                                                       defaults={"connection": c, "role": d["role"]})
        return Response(view(g, t, me), status=201)


class Detail(APIView):
    def delete(self, request, pk):
        n, _ = TaskGrant.objects.filter(owner=request.user.pk, pk=pk).delete()
        if not n:
            raise ApiError("not_found", 404)
        return Response(status=204)

    def patch(self, request, pk):
        data = Changes(data=request.data)
        data.is_valid(raise_exception=True)
        d = data.validated_data
        with transaction.atomic(using="social"):
            g = TaskGrant.objects.select_related("connection").select_for_update().filter(
                pk=pk, recipient=request.user.pk, connection__status="accepted").first()
            if not g:
                raise ApiError("not_found", 404)
            if g.role != "editor":
                raise ApiError("forbidden", 403)
            with transaction.atomic(using="planning"):
                t = tasks().select_for_update().filter(pk=g.task_id, user_id=g.owner).first()
                if not t:
                    raise ApiError("not_found", 404)
                if d["version"] != t.version:
                    raise ApiError("version_conflict", 409)
                t.title, t.description = d["title"], d.get("description", t.description)
                t.version += 1
                t.save(update_fields=["title", "description", "version", "updated_at"])
        return Response(view(g, t, request.user.pk))
