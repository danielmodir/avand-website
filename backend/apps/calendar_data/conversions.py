"""Calendar arithmetic: Jalali <-> Gregorian (exact) and Hijri.

Hijri dates come from the official month starts (HijriMonthStart) when
the date is covered; otherwise from the tabular (arithmetic) Islamic
calendar, flagged as estimated.
"""
from bisect import bisect_right
from datetime import date, timedelta

# ── Jalali (algorithm of jdf / Borkowski, valid for 1 – 3177 SH) ─────────

_G_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def gregorian_to_jalali(gy, gm, gd):
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + _G_DAYS[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        return jy, 1 + days // 31, 1 + days % 31
    return jy, 7 + (days - 186) // 30, 1 + (days - 186) % 30


def jalali_to_gregorian(jy, jm, jd):
    jy += 1595
    days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33) + 3) // 4 + jd + ((jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186)
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    gd = days + 1
    leap = (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0
    month_days = [0, 31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 1
    while gm <= 12 and gd > month_days[gm]:
        gd -= month_days[gm]
        gm += 1
    return gy, gm, gd


def jalali_year_range(jy):
    """First and last Gregorian date of Jalali year jy."""
    start = date(*jalali_to_gregorian(jy, 1, 1))
    end = date(*jalali_to_gregorian(jy + 1, 1, 1)) - timedelta(days=1)
    return start, end


# ── Hijri ────────────────────────────────────────────────────────────────

def _tabular_hijri(d: date):
    """Arithmetic (civil, epoch 16 July 622) Islamic calendar."""
    jd = d.toordinal() + 1721425  # Julian day number
    l = jd - 1948440 + 10632
    n = (l - 1) // 10631
    l = l - 10631 * n + 354
    j = ((10985 - l) // 5316) * ((50 * l) // 17719) + (l // 5670) * ((43 * l) // 15238)
    l = l - ((30 - j) // 15) * ((17719 * j) // 50) - (j // 16) * ((15238 * j) // 43) + 29
    month = (24 * l) // 709
    day = l - (709 * month) // 24
    year = 30 * n + j - 30
    return year, month, day


class HijriCalendar:
    """Converter seeded with official month starts (sorted)."""

    def __init__(self, month_starts):
        # month_starts: iterable of (starts_on: date, hijri_year, hijri_month)
        self.rows = sorted(month_starts)
        self.dates = [r[0] for r in self.rows]

    def convert(self, d: date):
        """Returns (year, month, day, estimated)."""
        i = bisect_right(self.dates, d) - 1
        if i >= 0:
            start, hy, hm = self.rows[i]
            offset = (d - start).days
            # Covered only up to the next known start, or 30 days past the last.
            limit = (self.dates[i + 1] - start).days if i + 1 < len(self.dates) else 30
            if offset < limit and offset < 30:
                return hy, hm, offset + 1, False
        hy, hm, hd = _tabular_hijri(d)
        return hy, hm, hd, True

    @classmethod
    def from_db(cls):
        from .models import HijriMonthStart

        return cls(HijriMonthStart.objects.values_list("starts_on", "hijri_year", "hijri_month"))
