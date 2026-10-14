from django.contrib import admin

from .models import HijriMonthStart, Occasion
from .services import clear_cache


class ClearsCacheAdmin(admin.ModelAdmin):
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        clear_cache()

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        clear_cache()


@admin.register(Occasion)
class OccasionAdmin(ClearsCacheAdmin):
    list_display = ["title_fa", "calendar", "month", "day", "is_holiday", "is_active", "source"]
    list_filter = ["calendar", "is_holiday", "is_active", "source"]
    search_fields = ["title_fa", "title_en"]
    list_editable = ["is_holiday", "is_active"]


@admin.register(HijriMonthStart)
class HijriMonthStartAdmin(ClearsCacheAdmin):
    """Enter each month's official start as soon as it is announced."""

    list_display = ["hijri_year", "hijri_month", "starts_on", "is_forecast", "note"]
    list_editable = ["starts_on", "is_forecast"]
    list_filter = ["hijri_year", "is_forecast"]
