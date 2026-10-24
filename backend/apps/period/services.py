from datetime import date, timedelta
from statistics import mean

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import ApiError

from . import crypto
from .models import PeriodCycle, PeriodProfile, PeriodUserKey

DB = "period"
# enabled / last_start: the app's period desk switch and the setup quiz's
# last start date, saved with the rest so the desk stays on once turned on.
# regular / remind_days: the setup popup's other answers; quiz_cycle /
# quiz_period: its original numbers (cycle/period_length follow the log);
# log: [{s, e}] logged periods; asked: {question: last day asked} for the
# app's "has it started / ended?" check-ins (2026-10-24).
DEFAULT_PROFILE = {"cycle_length": 28, "period_length": 6, "quiz_step": 0, "show_on_calendar": False, "enabled": False, "last_start": None,
                   "regular": "", "remind_days": 0, "quiz_cycle": None, "quiz_period": None, "log": [], "asked": {}}


def user_key(user_id, create=False):
    key = PeriodUserKey.objects.filter(user_id=user_id).first()
    if key is None and create:
        wrapped, version = crypto.new_wrapped_dek(user_id)
        key = PeriodUserKey.objects.create(user_id=user_id, wrapped_dek=wrapped, kek_version=version)
    return key


def read_profile(user_id):
    key = user_key(user_id)
    row = PeriodProfile.objects.filter(key_id=user_id).first() if key else None
    if row is None:
        return {**DEFAULT_PROFILE, "version": 0}
    data = crypto.decrypt_json(crypto.unwrap_dek(key), row.enc_data, "profile", user_id, user_id)
    return {**DEFAULT_PROFILE, **data, "version": row.version}


def write_profile(user_id, data, sent_version):
    with transaction.atomic(using=DB):
        key = user_key(user_id, create=True)
        row = PeriodProfile.objects.select_for_update().filter(key=key).first()
        current = read_profile(user_id)
        if row is not None and sent_version != row.version:
            raise ApiError("version_conflict", 409, extra={"current": current})
        payload = {k: data.get(k, current[k]) for k in DEFAULT_PROFILE}
        blob = crypto.encrypt_json(crypto.unwrap_dek(key), payload, "profile", user_id, user_id)
        if row is None:
            row = PeriodProfile.objects.create(key=key, enc_data=blob)
        else:
            row.enc_data = blob
            row.version += 1
            row.save(update_fields=["enc_data", "version", "updated_at"])
        return {**payload, "version": row.version}


def _cycle_dict(dek, row, user_id):
    data = crypto.decrypt_json(dek, row.enc_data, "cycle", row.id, user_id)
    return {"id": str(row.id), **data, "version": row.version, "updated_at": row.updated_at, "deleted_at": row.deleted_at}


def list_cycles(user_id, since=None):
    key = user_key(user_id)
    if key is None:
        return []
    qs = PeriodCycle.objects.filter(key=key)
    # Same overlap as planning sync (see planning.views.SYNC_OVERLAP).
    qs = qs.filter(updated_at__gte=since - timedelta(seconds=5)) if since else qs.filter(deleted_at__isnull=True)
    dek = crypto.unwrap_dek(key)
    return sorted((_cycle_dict(dek, row, user_id) for row in qs), key=lambda c: c["start_date"])


def upsert_cycle(user_id, cycle_id, data):
    start, end = data.get("start_date"), data.get("end_date")
    try:
        start_d = date.fromisoformat(start)
        end_d = date.fromisoformat(end) if end else None
    except (TypeError, ValueError):
        raise ApiError("invalid_date")
    if end_d and not 0 <= (end_d - start_d).days <= 15:
        raise ApiError("invalid_period_length")
    with transaction.atomic(using=DB):
        key = user_key(user_id, create=True)
        dek = crypto.unwrap_dek(key)
        row = PeriodCycle.objects.select_for_update().filter(pk=cycle_id).first()
        payload = {"start_date": start_d.isoformat(), "end_date": end_d.isoformat() if end_d else None}
        if row is None:
            row = PeriodCycle(id=cycle_id, key=key)
            row.enc_data = crypto.encrypt_json(dek, payload, "cycle", cycle_id, user_id)
            row.save()
            return _cycle_dict(dek, row, user_id), True
        if row.key_id != user_id:
            raise ApiError("not_found", 404)
        if data.get("version") != row.version:
            raise ApiError("version_conflict", 409, extra={"current": _cycle_dict(dek, row, user_id)})
        row.enc_data = crypto.encrypt_json(dek, payload, "cycle", row.id, user_id)
        row.version += 1
        row.deleted_at = None
        row.save()
        return _cycle_dict(dek, row, user_id), False


def delete_cycle(user_id, cycle_id):
    updated = PeriodCycle.objects.filter(pk=cycle_id, key_id=user_id, deleted_at__isnull=True).update(deleted_at=timezone.now())
    if not updated:
        raise ApiError("not_found", 404)


def predictions(user_id, count=3):
    """Next period starts and fertile windows. An estimate for the user's
    own planning, not medical advice."""
    profile = read_profile(user_id)
    starts = [date.fromisoformat(c["start_date"]) for c in list_cycles(user_id)]
    if not starts:
        return {"basis": "none", "next": []}
    gaps = [(b - a).days for a, b in zip(starts, starts[1:]) if 18 <= (b - a).days <= 60][-6:]
    cycle = round(mean(gaps)) if len(gaps) >= 2 else profile["cycle_length"]
    upcoming, start = [], starts[-1]
    for _ in range(count):
        start = start + timedelta(days=cycle)
        ovulation = start - timedelta(days=14)
        upcoming.append({
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=profile["period_length"] - 1)).isoformat(),
            "fertile_from": (ovulation - timedelta(days=5)).isoformat(),
            "fertile_to": (ovulation + timedelta(days=1)).isoformat(),
        })
    return {"basis": "history" if len(gaps) >= 2 else "profile", "cycle_length": cycle, "next": upcoming}


def purge_user(user_id):
    """Deleting the key row cascades to every row and shreds what backups hold."""
    PeriodUserKey.objects.filter(user_id=user_id).delete()
