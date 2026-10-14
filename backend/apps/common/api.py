"""Helpers shared by the module APIs."""
from datetime import date, timezone as dt_timezone

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .exceptions import ApiError, VersionConflict


def parse_since(value):
    """?since=<ISO datetime> for incremental sync; None means everything."""
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        raise ApiError("invalid_since")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, dt_timezone.utc)
    return parsed


def parse_day(value):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ApiError("invalid_date")


def check_version(instance, sent_version, serializer_class):
    """Optimistic locking: the client must send the version it last read."""
    if sent_version is None:
        raise ApiError("version_required")
    if int(sent_version) != instance.version:
        raise VersionConflict(serializer_class(instance).data)
