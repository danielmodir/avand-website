"""Import calendar reference data from the bundled JSON files.

Model classes are passed in so the same code runs from a data migration
(historical models) and from the management command (real models).
"""
import json
from datetime import date
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
OCCASIONS_FILE = DATA_DIR / "occasions_basemax.json"
HIJRI_FILE = DATA_DIR / "hijri_months_iran.json"

# Month spellings used by the BaseMax/persian-holidays-api dataset.
# Hijri pairs are two words ("جمادي الثانيه"): matching only the first
# word is what put Jumada II occasions in Jumada I in the old demo.
JALALI_MONTHS = {
    "فروردین": 1, "اردیبهشت": 2, "خرداد": 3, "تیر": 4, "مرداد": 5, "اَمرداد": 5, "شهریور": 6,
    "مهر": 7, "آبان": 8, "آذر": 9, "دی": 10, "بهمن": 11, "اسفند": 12,
}
GREGORIAN_MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6, "July": 7,
    "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
}
HIJRI_MONTHS = {
    "محرم": 1, "صفر": 2, "ربيع الاول": 3, "ربيع الثاني": 4, "جمادي الاولي": 5, "جمادي الثانيه": 6,
    "رجب": 7, "شعبان": 8, "رمضان": 9, "شوال": 10, "ذوالقعده": 11, "ذوالحجه": 12,
}
CALENDARS = {"shamsi": ("jalali", JALALI_MONTHS), "gregorian": ("gregorian", GREGORIAN_MONTHS), "hijri": ("hijri", HIJRI_MONTHS)}


def parse_dataset_entry(entry):
    """{"is_holiday", "event_name", "date": {"type", "date": [day, *month words]}}
    -> (calendar, month, day, title, is_holiday)."""
    kind = entry["date"]["type"]
    calendar, months = CALENDARS[kind]
    day, *month_words = entry["date"]["date"]
    month_name = " ".join(month_words)
    if month_name not in months:
        raise ValueError(f"Unknown {kind} month: {month_name!r}")
    return calendar, months[month_name], int(day), entry["event_name"].strip(), bool(entry["is_holiday"])


def load_occasions(Occasion, path=OCCASIONS_FILE):
    entries = json.loads(Path(path).read_text(encoding="utf-8"))
    count = 0
    for entry in entries:
        calendar, month, day, title, holiday = parse_dataset_entry(entry)
        Occasion.objects.update_or_create(
            calendar=calendar, month=month, day=day, title_fa=title,
            defaults={"is_holiday": holiday, "source": "dataset"},
        )
        count += 1
    return count


def load_hijri_months(HijriMonthStart, path=HIJRI_FILE):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    for row in data["months"]:
        HijriMonthStart.objects.update_or_create(
            hijri_year=row["hijri_year"], hijri_month=row["hijri_month"],
            defaults={"starts_on": date.fromisoformat(row["starts_on"]), "is_forecast": bool(row.get("forecast"))},
        )
    return len(data["months"])
