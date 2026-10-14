"""toojibee_calendar: shared calendar reference data (not user data)."""
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Occasion(models.Model):
    """A yearly occasion, defined on the calendar it belongs to (Nowruz on
    1 Farvardin, Ashura on 10 Muharram, World Teachers' Day on 5 October).
    The API turns these into real dates for a requested year."""

    class Calendar(models.TextChoices):
        JALALI = "jalali"
        GREGORIAN = "gregorian"
        HIJRI = "hijri"

    class Source(models.TextChoices):
        DATASET = "dataset", "Bundled open dataset"
        ADMIN = "admin", "Added in the admin"

    calendar = models.CharField(max_length=10, choices=Calendar.choices)
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    day = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(31)])
    title_fa = models.CharField(max_length=300)
    title_en = models.CharField(max_length=300, blank=True)
    is_holiday = models.BooleanField(default=False, help_text="Official public holiday in Iran.")
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.ADMIN)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["calendar", "month", "day"]
        indexes = [models.Index(fields=["calendar", "month", "day"], name="cal_occasion_date_idx")]
        constraints = [
            models.UniqueConstraint(fields=["calendar", "month", "day", "title_fa"], name="cal_occasion_uq"),
            models.CheckConstraint(condition=Q(month__gte=1, month__lte=12, day__gte=1, day__lte=31), name="cal_occasion_date_ck"),
        ]

    def __str__(self):
        return f"{self.day}/{self.month} ({self.calendar}) {self.title_fa}"


class HijriMonthStart(models.Model):
    """First Gregorian day of each Hijri month as announced in Iran.

    Iran starts Hijri months by moon sighting, so the arithmetic Hijri
    calendar is often a day off; these rows are the truth and arithmetic
    is only the fallback outside the covered range."""

    hijri_year = models.PositiveSmallIntegerField()
    hijri_month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    starts_on = models.DateField(unique=True)
    is_forecast = models.BooleanField(default=False, help_text="Published forecast, not yet confirmed by moon sighting.")
    note = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_on"]
        constraints = [
            models.UniqueConstraint(fields=["hijri_year", "hijri_month"], name="cal_hijri_month_uq"),
            models.CheckConstraint(condition=Q(hijri_month__gte=1, hijri_month__lte=12), name="cal_hijri_month_ck"),
        ]

    def __str__(self):
        return f"{self.hijri_year}/{self.hijri_month} → {self.starts_on}"
