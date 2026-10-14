from datetime import date

from rest_framework.test import APIClient

from apps.calendar_data.conversions import HijriCalendar, gregorian_to_jalali, jalali_to_gregorian
from apps.calendar_data.loaders import parse_dataset_entry
from apps.common.testing import ApiTestCase


class ConversionTests(ApiTestCase):
    def test_jalali_round_trip(self):
        self.assertEqual(gregorian_to_jalali(2026, 10, 15), (1405, 7, 23))
        self.assertEqual(jalali_to_gregorian(1405, 1, 1), (2026, 3, 21))

    def test_official_hijri_months_win_over_arithmetic(self):
        hijri = HijriCalendar.from_db()
        self.assertEqual(hijri.convert(date(2026, 10, 15)), (1448, 5, 4, False))  # matches Iran's calendar
        self.assertEqual(HijriCalendar([]).convert(date(2026, 10, 15))[:3], (1448, 5, 3))  # arithmetic is a day off

    def test_two_word_hijri_months_are_kept_apart(self):
        entry = {"is_holiday": True, "event_name": "x", "date": {"type": "hijri", "date": ["3", "جمادي", "الثانيه"]}}
        self.assertEqual(parse_dataset_entry(entry)[:3], ("hijri", 6, 3))


class OccasionApiTests(ApiTestCase):
    def test_year_1405(self):
        data = APIClient().get("/api/v1/calendar/occasions?year=1405").json()
        self.assertEqual((data["from"], data["to"]), ("2026-03-21", "2027-03-20"))
        by_date = {}
        for o in data["occasions"]:
            by_date.setdefault(o["date"], []).append(o)
        self.assertTrue(any(o["is_holiday"] and "نوروز" in o["title_fa"] for o in by_date["2026-03-21"]))
        # 3 Jumada II 1448 = 2026-11-13 (Jumada II starts 2026-11-11), not mid-October.
        fatemiyeh = [o for o in data["occasions"] if "فاطمه زهرا" in o["title_fa"] and o["is_holiday"]]
        self.assertEqual([o["date"] for o in fatemiyeh], ["2026-11-13"])
        self.assertFalse(any("فاطمه زهرا" in o["title_fa"] for o in by_date.get("2026-10-15", [])))

    def test_day_endpoint(self):
        day = APIClient().get("/api/v1/calendar/day?date=2026-10-15").json()
        self.assertEqual(day["jalali"], {"year": 1405, "month": 7, "day": 23})
        self.assertEqual(day["hijri"], {"year": 1448, "month": 5, "day": 4, "estimated": False})
