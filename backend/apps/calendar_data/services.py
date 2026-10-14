"""Turns yearly occasion definitions into the real dates of a Jalali year."""
from collections import defaultdict
from datetime import timedelta

from django.core.cache import cache

from .conversions import HijriCalendar, gregorian_to_jalali, jalali_year_range
from .models import HijriMonthStart, Occasion

CACHE_SECONDS = 600


def occasions_for_jalali_year(jy):
    key = f"calendar:occasions:{jy}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    by_date = defaultdict(list)
    for o in Occasion.objects.filter(is_active=True):
        by_date[(o.calendar, o.month, o.day)].append(o)
    hijri = HijriCalendar.from_db()

    start, end = jalali_year_range(jy)
    result, day = [], start
    while day <= end:
        _, jm, jd = gregorian_to_jalali(day.year, day.month, day.day)
        hy, hm, hd, estimated = hijri.convert(day)
        matches = (
            [(o, False) for o in by_date[("jalali", jm, jd)]]
            + [(o, False) for o in by_date[("gregorian", day.month, day.day)]]
            + [(o, estimated) for o in by_date[("hijri", hm, hd)]]
        )
        for o, est in matches:
            result.append({
                "date": day.isoformat(), "calendar": o.calendar, "title_fa": o.title_fa, "title_en": o.title_en,
                "is_holiday": o.is_holiday,
                # Hijri occasions outside the officially announced months are
                # placed with arithmetic and may be a day off.
                "estimated": est,
            })
        day += timedelta(days=1)
    cache.set(key, result, CACHE_SECONDS)
    return result


def hijri_months_between(start, end):
    return list(
        HijriMonthStart.objects.filter(starts_on__gte=start - timedelta(days=31), starts_on__lte=end)
        .values("hijri_year", "hijri_month", "starts_on", "is_forecast")
    )


def clear_cache():
    cache.delete_many([f"calendar:occasions:{y}" for y in range(1395, 1430)])
