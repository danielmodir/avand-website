import re

from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import ApiError
from apps.core.models import Profile, User

from . import services
from .models import Connection, Invite, Report


def _people(user_ids):
    """Display info from the core database, keyed by user id."""
    profiles = Profile.objects.filter(user_id__in=user_ids, user__status=User.Status.ACTIVE)
    return {str(p.user_id): {"id": str(p.user_id), "name": p.display_name, "username": p.username, "public_id": p.public_id} for p in profiles}


def _target(request, user_id):
    if str(user_id) == str(request.user.id):
        raise ApiError("cannot_target_self")
    if not User.objects.filter(id=user_id, status=User.Status.ACTIVE).exists():
        raise ApiError("user_not_found", 404)
    return user_id


class ConnectionListView(APIView):
    def get(self, request):
        me = request.user.id
        rows = Connection.objects.filter(Q(user_a=me) | Q(user_b=me)).order_by("-updated_at")
        rows = [r for r in rows if services.perspective(r, me) != "blocked-by-them"]  # a blocker simply disappears
        people = _people([r.other(me) for r in rows])
        return Response([
            {**people[str(r.other(me))], "status": services.perspective(r, me), "since": r.updated_at}
            for r in rows if str(r.other(me)) in people
        ])


class SearchView(APIView):
    """Exact username or phone (if that person allows it). No partial
    matches, so the endpoint can't be used to list users."""

    throttle_scope = "search"

    def get(self, request):
        # Persian/Arabic digits, invisible marks and spaces from phone keyboards.
        raw = (request.query_params.get("q") or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789", "‌‎‏"))
        q = re.sub(r"\s+", "", raw).lstrip("@")
        if len(q) < 3:
            return Response([])
        # Shown in the app as TJ-XXXXXXXX; codes never use I, L, O or U.
        code = re.sub(r"^TJ[-–_]?", "", q.upper()).translate(str.maketrans("OIL", "011"))
        profiles = Profile.objects.filter(user__status=User.Status.ACTIVE).exclude(user_id=request.user.id).filter(
            Q(username=q.lower(), user__settings__discoverable_by_username=True)
            | Q(phone=q, user__settings__discoverable_by_phone=True)
            | Q(public_id=code)
        )[:5]
        found = [p for p in profiles if not services.is_blocked_between(request.user.id, p.user_id)]
        return Response(list(_people([p.user_id for p in found]).values()))


class RequestView(APIView):
    def post(self, request, user_id):
        services.send_request(request.user.id, _target(request, user_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class RespondView(APIView):
    def post(self, request, user_id):
        accept = request.data.get("accept")
        if not isinstance(accept, bool):
            raise ApiError("accept_must_be_boolean")
        services.respond(request.user.id, user_id, accept)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConnectionDetailView(APIView):
    def delete(self, request, user_id):
        services.remove(request.user.id, user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockView(APIView):
    def put(self, request, user_id):
        services.block(request.user.id, _target(request, user_id))
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, user_id):
        services.unblock(request.user.id, user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteListView(APIView):
    def get(self, request):
        invites = Invite.objects.filter(inviter_user_id=request.user.id, revoked_at__isnull=True).order_by("-created_at")
        return Response([{"id": str(i.id), "code": i.code, "uses": i.uses, "max_uses": i.max_uses, "usable": i.is_usable} for i in invites])

    def post(self, request):
        invite = services.create_invite(request.user.id, request.data.get("max_uses"))
        return Response({"id": str(invite.id), "code": invite.code}, status=status.HTTP_201_CREATED)


class InviteDetailView(APIView):
    def delete(self, request, invite_id):
        from django.utils import timezone

        Invite.objects.filter(id=invite_id, inviter_user_id=request.user.id).update(revoked_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class RedeemInviteView(APIView):
    def post(self, request, code):
        invite = services.redeem_invite(request.user.id, code.lower())
        return Response({"inviter": _people([invite.inviter_user_id]).get(str(invite.inviter_user_id)),
                         "status": "pending" if invite.pending else "accepted"})


class ReportInput(serializers.Serializer):
    user_id = serializers.UUIDField()
    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    details = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class ReportView(APIView):
    throttle_scope = "report"

    def post(self, request):
        data = ReportInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        services.file_report(request.user.id, _target(request, v["user_id"]), v["reason"], v.get("details", ""))
        return Response(status=status.HTTP_202_ACCEPTED)
