from django.contrib import admin
from django.utils import timezone

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """Moderation queue. Suspending the reported account happens in Users
    (search by id); this records the decision."""

    list_display = ["created_at", "reason", "status", "reported_user_id", "reporter_user_id"]
    list_filter = ["status", "reason"]
    search_fields = ["reported_user_id", "reporter_user_id"]
    readonly_fields = ["reporter_user_id", "reported_user_id", "reason", "details", "created_at", "reviewed_by", "reviewed_at"]
    fields = readonly_fields + ["status", "resolution_note"]

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        if obj.status != Report.Status.OPEN:
            obj.reviewed_by = request.user.id
            obj.reviewed_at = timezone.now()
        super().save_model(request, obj, form, change)
