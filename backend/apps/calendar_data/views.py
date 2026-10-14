from datetime import date

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import parse_day
from apps.common.exceptions import ApiError

from .conversions import HijriCalendar, gregorian_to_jalali, jalali_year_range
from .services import hijri_months_between, occasions_for_jalali_year


class PublicCalendarView(APIView):
    """Reference data, the same for everyone: no login, cacheable."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if response.status_code == 200:
            response["Cache-Control"] = "public, max-age=3600"
        return response


def _jalali_year(request):
    raw = request.query_params.get("year")
    if raw is None:
        today = date.today()
        return gregorian_to_jalali(today.year, today.month, today.day)[0]
    try:
        year = int(raw)
    except ValueError:
        raise ApiError("invalid_year")
    if not 1300 <= year <= 1500:
        raise ApiError("invalid_year")
    return year


class OccasionsView(PublicCalendarView):
    """GET /calendar/occasions?year=1405 → every occasion of that Jalali
    year on its real Gregorian date, plus the Hijri month starts used."""

    def get(self, request):
        jy = _jalali_year(request)
        start, end = jalali_year_range(jy)
        return Response({
            "jalali_year": jy,
            "from": start, "to": end,
            "hijri_months": hijri_months_between(start, end),
            "occasions": occasions_for_jalali_year(jy),
        })


class HijriMonthsView(PublicCalendarView):
    """GET /calendar/hijri-months?from=2026-03-21&to=2027-03-20"""

    def get(self, request):
        start = parse_day(request.query_params.get("from"))
        end = parse_day(request.query_params.get("to"))
        if end < start or (end - start).days > 800:
            raise ApiError("invalid_range")
        return Response(hijri_months_between(start, end))


class DayView(PublicCalendarView):
    """GET /calendar/day?date=2026-10-15 → the date in all three calendars."""

    def get(self, request):
        d = parse_day(request.query_params.get("date") or date.today().isoformat())
        jy, jm, jd = gregorian_to_jalali(d.year, d.month, d.day)
        hy, hm, hd, estimated = HijriCalendar.from_db().convert(d)
        return Response({
            "gregorian": d.isoformat(),
            "jalali": {"year": jy, "month": jm, "day": jd},
            "hijri": {"year": hy, "month": hm, "day": hd, "estimated": estimated},
        })
