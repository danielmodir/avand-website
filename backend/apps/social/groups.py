"""Group planning: a group has a name, an owner and members (friends the
owner ticked, or anyone who opened its link). Members share the group's
tasks, habits and events; each item is ticked by each member on their own
("each") or once for everybody ("shared"). Every member picks the group's
color for themselves. Only the owner deletes the group or edits its name
and members; the others can leave. Same paths and shapes as the PHP API."""
import json
import re
import secrets
import uuid

from django.db import transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import ApiError

from .models import Connection, Group, GroupItem, GroupMark, GroupMember

DB = "social"
GROUPS_MAX = 20
MEMBERS_MAX = 30
ITEMS_MAX = 500
ITEM_BYTES = 400_000
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # no I, L, O, U
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
ITEM_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
MARK_KEY_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}|once)(:[A-Za-z0-9-]{8,64})?$")


def _color(value):
    if not isinstance(value, str) or not COLOR_RE.match(value):
        raise ApiError("validation_error", extra={"fields": {"color": ["invalid"]}})
    return value.upper()


def _name(value):
    name = (value or "").strip()[:60] if isinstance(value, str) else ""
    if not name:
        raise ApiError("validation_error", extra={"fields": {"name": ["required"]}})
    return name


def _token():
    while True:
        tok = "".join(secrets.choice(CODE_ALPHABET) for _ in range(20))
        if not Group.objects.filter(invite_token=tok).exists():
            return tok


def _are_friends(x, y):
    a, b = Connection.pair(x, y)
    return Connection.objects.filter(user_a=a, user_b=b, status=Connection.Status.ACCEPTED).exists()


def _friend_ids(me, ids):
    if not isinstance(ids, list):
        raise ApiError("validation_error", extra={"fields": {"members": ["invalid"]}})
    out = []
    for pid in dict.fromkeys(ids):
        try:
            pid = str(uuid.UUID(str(pid)))
        except ValueError:
            raise ApiError("validation_error", extra={"fields": {"members": ["invalid"]}})
        if not _are_friends(me, pid):
            raise ApiError("not_a_friend")
        out.append(pid)
    return out


def _groups_count(user_id):
    return GroupMember.objects.filter(user_id=user_id).count()


def _add_member(group, user_id, color):
    GroupMember.objects.get_or_create(group=group, user_id=user_id, defaults={"color": color})


def _mine(me, group_id):
    member = GroupMember.objects.select_related("group").filter(group_id=group_id, user_id=me).first()
    if member is None:
        raise ApiError("not_found", 404)
    return member.group, member


def _drop_member(group, user_id):
    """Their own ticks go with them; items they made stay."""
    GroupMark.objects.filter(item__group=group, user_id=user_id).delete()
    GroupMember.objects.filter(group=group, user_id=user_id).delete()


def payload(me):
    from .views import _people

    mine = list(GroupMember.objects.select_related("group").filter(user_id=me).order_by("joined_at"))
    groups = {m.group_id: m for m in mine}
    if not groups:
        return {"groups": [], "items": []}
    members = list(GroupMember.objects.filter(group_id__in=groups).order_by("joined_at"))
    items = list(GroupItem.objects.filter(group_id__in=groups).order_by("id"))
    marks = list(GroupMark.objects.filter(item__in=items))
    people = _people({m.user_id for m in members} | {k.user_id for k in marks})
    out = []
    for gid, m in groups.items():
        g = m.group
        out.append({
            "id": str(g.id), "name": g.name, "color": m.color, "owner": str(g.owner_user_id) == str(me), "token": g.invite_token,
            "members": [{**people[str(x.user_id)], "status": "member", "owner": str(x.user_id) == str(g.owner_user_id), "me": str(x.user_id) == str(me)}
                        for x in members if x.group_id == gid and str(x.user_id) in people],
        })
    by_item = {}
    for k in marks:
        p = people.get(str(k.user_id), {})
        by_item.setdefault(k.item_id, []).append({"key": k.key, "status": k.status, "user": str(k.user_id),
                                                  "name": p.get("name", ""), "me": str(k.user_id) == str(me)})
    return {"groups": out, "items": [
        {"id": i.item_id, "group": str(i.group_id), "kind": i.kind, "data": i.data, "done_mode": i.done_mode,
         "by": str(i.created_by) if i.created_by else None, "mine": str(i.created_by) == str(me), "marks": by_item.get(i.id, [])}
        for i in items
    ]}


class GroupListView(APIView):
    throttle_scope = "groups"

    def get(self, request):
        return Response(payload(request.user.id))

    def post(self, request):
        me = request.user.id
        name, color = _name(request.data.get("name")), _color(request.data.get("color"))
        friends = _friend_ids(me, request.data.get("members", []))
        if len(friends) + 1 > MEMBERS_MAX:
            raise ApiError("too_many", extra={"max": MEMBERS_MAX})
        if _groups_count(me) >= GROUPS_MAX:
            raise ApiError("too_many_groups", 429, extra={"max": GROUPS_MAX})
        with transaction.atomic(using=DB):
            group = Group.objects.create(name=name, owner_user_id=me, invite_token=_token())
            _add_member(group, me, color)
            for f in friends:  # same color to start with; each can change their own
                if _groups_count(f) < GROUPS_MAX:
                    _add_member(group, f, color)
        return Response({**payload(me), "created": str(group.id)}, status=201)


class GroupDetailView(APIView):
    def patch(self, request, group_id):
        me = request.user.id
        group, member = _mine(me, group_id)
        data = request.data
        if "color" in data:
            member.color = _color(data["color"])
            member.save(update_fields=["color"])
        if "name" in data or "members" in data:
            if str(group.owner_user_id) != str(me):
                raise ApiError("not_owner", 403)
            if "name" in data:
                group.name = _name(data["name"])
                group.save(update_fields=["name", "updated_at"])
            if "members" in data:
                ids = data["members"]
                if not isinstance(ids, list):
                    raise ApiError("validation_error", extra={"fields": {"members": ["invalid"]}})
                current = {str(m.user_id) for m in group.members.all()}
                keep = [i for i in dict.fromkeys(ids) if isinstance(i, str) and i in current]
                add = _friend_ids(me, [i for i in ids if i not in current])
                if len(keep) + len(add) + 1 > MEMBERS_MAX:
                    raise ApiError("too_many", extra={"max": MEMBERS_MAX})
                with transaction.atomic(using=DB):
                    for uid in current - set(keep) - {str(me)}:
                        _drop_member(group, uid)
                    for f in add:
                        if _groups_count(f) < GROUPS_MAX:
                            _add_member(group, f, member.color)
        return Response(payload(me))

    def delete(self, request, group_id):
        me = request.user.id
        group, _ = _mine(me, group_id)
        if str(group.owner_user_id) != str(me):
            raise ApiError("not_owner", 403)
        group.delete()
        return Response(payload(me))


class GroupLeaveView(APIView):
    def post(self, request, group_id):
        me = request.user.id
        group, _ = _mine(me, group_id)
        if str(group.owner_user_id) == str(me):
            raise ApiError("owner_cannot_leave")
        _drop_member(group, me)
        return Response(payload(me))


class GroupInviteResetView(APIView):
    def post(self, request, group_id):
        me = request.user.id
        group, _ = _mine(me, group_id)
        if str(group.owner_user_id) != str(me):
            raise ApiError("not_owner", 403)
        group.invite_token = _token()
        group.save(update_fields=["invite_token", "updated_at"])
        return Response(payload(me))


class GroupJoinView(APIView):
    throttle_scope = "groups"

    def post(self, request):
        me = request.user.id
        tok = str(request.data.get("token") or "").strip().upper()
        group = Group.objects.filter(invite_token=tok).first() if re.match(r"^[0-9A-HJKMNP-TV-Z]{20}$", tok) else None
        if group is None:
            raise ApiError("group_not_found", 404)
        if not group.members.filter(user_id=me).exists():
            a, b = Connection.pair(me, group.owner_user_id)
            if Connection.objects.filter(user_a=a, user_b=b, status=Connection.Status.BLOCKED).exists():
                raise ApiError("group_not_found", 404)
            if group.members.count() >= MEMBERS_MAX:
                raise ApiError("group_full", extra={"max": MEMBERS_MAX})
            if _groups_count(me) >= GROUPS_MAX:
                raise ApiError("too_many_groups", 429, extra={"max": GROUPS_MAX})
            owner = group.members.filter(user_id=group.owner_user_id).first()
            _add_member(group, me, owner.color if owner else "#EB7D00")
        return Response({**payload(me), "joined": str(group.id), "name": group.name})


def _item(group, item_id):
    if not ITEM_ID_RE.match(item_id):
        raise ApiError("not_found", 404)
    return GroupItem.objects.filter(group=group, item_id=item_id).first()


def _may_edit(group, item, me):
    return str(item.created_by) == str(me) or str(group.owner_user_id) == str(me)


class GroupItemView(APIView):
    def put(self, request, group_id, item_id):
        me = request.user.id
        group, _ = _mine(me, group_id)
        row = _item(group, item_id)
        kind, data = request.data.get("kind"), request.data.get("data")
        if kind not in GroupItem.Kind.values:
            raise ApiError("validation_error", extra={"fields": {"kind": ["invalid"]}})
        if not isinstance(data, dict):
            raise ApiError("validation_error", extra={"fields": {"data": ["invalid"]}})
        if len(json.dumps(data, ensure_ascii=False).encode()) > ITEM_BYTES:
            raise ApiError("too_large", 413)
        mode = "shared" if request.data.get("done_mode") == "shared" else "each"
        if row:
            if not _may_edit(group, row, me):
                raise ApiError("not_yours", 403)
            if row.kind != kind:
                raise ApiError("validation_error", extra={"fields": {"kind": ["invalid"]}})
            row.data, row.done_mode = data, mode
            row.save(update_fields=["data", "done_mode", "updated_at"])
        else:
            if GroupItem.objects.filter(item_id=item_id).exists():
                raise ApiError("id_taken", 409)
            if group.items.count() >= ITEMS_MAX:
                raise ApiError("too_many", extra={"max": ITEMS_MAX})
            GroupItem.objects.create(group=group, item_id=item_id, kind=kind, data=data, done_mode=mode, created_by=me)
        return Response({"ok": True})

    def delete(self, request, group_id, item_id):
        me = request.user.id
        group, _ = _mine(me, group_id)
        row = _item(group, item_id)
        if row:
            if not _may_edit(group, row, me):
                raise ApiError("not_yours", 403)
            row.delete()
        return Response({"ok": True})


class GroupMarkView(APIView):
    def put(self, request, group_id, item_id):
        me = request.user.id
        group, _ = _mine(me, group_id)
        row = _item(group, item_id)
        if row is None:
            raise ApiError("not_found", 404)
        key, status = str(request.data.get("key") or ""), request.data.get("status")
        if not MARK_KEY_RE.match(key):
            raise ApiError("validation_error", extra={"fields": {"key": ["invalid"]}})
        if status not in (None, "done", "not_done"):
            raise ApiError("validation_error", extra={"fields": {"status": ["invalid"]}})
        with transaction.atomic(using=DB):
            marks = GroupMark.objects.filter(item=row, key=key)
            # One tick for everybody: whoever changes it changes it for all.
            (marks if row.done_mode == "shared" else marks.filter(user_id=me)).delete()
            if status:
                GroupMark.objects.create(item=row, user_id=me, key=key, status=status)
        return Response({"ok": True})


def purge_user(user_id):
    """An account is deleted: groups they own go, they leave the rest."""
    Group.objects.filter(owner_user_id=user_id).delete()
    GroupMark.objects.filter(user_id=user_id).delete()
    GroupMember.objects.filter(user_id=user_id).delete()
