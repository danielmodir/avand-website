"""Read-only views of planning data, for support and debugging. Users'
own content is never edited by staff."""
from django.contrib import admin

from .models import Category, Event, Habit, Task


class ReadOnly(admin.ModelAdmin):
    list_filter = ["deleted_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Task)
class TaskAdmin(ReadOnly):
    list_display = ["title", "user_id", "start_date", "end_date", "rec_mode", "parent", "updated_at"]
    search_fields = ["user_id"]


@admin.register(Habit)
class HabitAdmin(ReadOnly):
    list_display = ["title", "user_id", "start_date", "rec_mode", "updated_at"]


@admin.register(Event)
class EventAdmin(ReadOnly):
    list_display = ["title", "user_id", "start_date", "all_day", "updated_at"]


@admin.register(Category)
class CategoryAdmin(ReadOnly):
    list_display = ["name", "user_id", "updated_at"]
