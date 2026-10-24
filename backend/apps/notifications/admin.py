from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model

from .models import Notice
from .notices import send_notice


class NoticeForm(forms.ModelForm):
    """Who gets it: everyone (active accounts) or one account by email."""

    target_email = forms.EmailField(required=False, help_text="For audience 'user': the account's email.")
    push = forms.BooleanField(required=False, initial=True, help_text="Also as a push notification, where reminders are on.")

    class Meta:
        model = Notice
        fields = ["title", "body", "audience"]

    def clean(self):
        data = super().clean()
        if data.get("audience") == Notice.Audience.USER and not data.get("target_email"):
            self.add_error("target_email", "Required for one user.")
        if data.get("audience") == Notice.Audience.FILTER:
            self.add_error("audience", "Filtered groups are sent from the PHP admin panel.")
        return data


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    form = NoticeForm
    list_display = ["created_at", "title", "audience", "recipients", "seen"]
    readonly_fields = ["recipients", "created_at"]

    @admin.display(description="Seen")
    def seen(self, obj):
        return obj.deliveries.filter(seen_at__isnull=False).count()

    def has_change_permission(self, request, obj=None):
        return obj is None  # sent messages stay as they were sent

    def save_model(self, request, obj, form, change):
        obj.created_by = getattr(request.user, "id", None)
        super().save_model(request, obj, form, change)
        User = get_user_model()
        users = User.objects.filter(status="active")
        if obj.audience == Notice.Audience.USER:
            users = users.filter(email__iexact=form.cleaned_data["target_email"])
        send_notice(obj, users.values_list("id", flat=True), push=form.cleaned_data.get("push", True))
