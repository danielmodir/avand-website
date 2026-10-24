from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm as BaseUserChangeForm
from django.contrib.auth.forms import UserCreationForm as BaseUserCreationForm
from django.utils import timezone

from .models import (
    AppContent, AppRelease, AuthEvent, AuthSession, EmailOutbox, LegalDocument, Module, Profile, StoredFile,
    SupportMessage, User, UserModule, UserPurgeTask, UserSettings,
)


class ReadOnlyAdmin(admin.ModelAdmin):
    """Logs and security records: visible to staff, never edited by hand."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class UserCreationForm(BaseUserCreationForm):
    class Meta:
        model = User
        fields = ("email",)


class UserChangeForm(BaseUserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    readonly_fields = ["public_id", "version", "created_at", "updated_at"]
    fk_name = "user"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    ordering = ["-created_at"]
    list_display = ["email", "status", "birth_date", "email_verified_at", "is_staff", "created_at"]
    list_filter = ["status", "is_staff", "is_superuser"]

    @admin.display(description="Birth date", ordering="profile__birth_date")
    def birth_date(self, obj):
        profile = getattr(obj, "profile", None)
        return profile.birth_date if profile else None
    search_fields = ["email", "profile__username", "profile__public_id"]
    readonly_fields = ["id", "created_at", "updated_at", "last_login", "deletion_requested_at"]
    inlines = [ProfileInline]
    fieldsets = [
        (None, {"fields": ["id", "email", "password"]}),
        ("Status", {"fields": ["status", "suspended_reason", "email_verified_at", "deletion_requested_at"]}),
        ("Admin access", {"fields": ["is_staff", "is_superuser", "groups"]}),
        ("Dates", {"fields": ["last_login", "created_at", "updated_at"]}),
    ]
    add_fieldsets = [(None, {"classes": ["wide"], "fields": ["email", "password1", "password2"]})]
    filter_horizontal = ["groups"]
    actions = ["suspend", "reactivate"]

    @admin.action(description="Suspend selected accounts (signs them out)")
    def suspend(self, request, queryset):
        from .services.accounts import revoke_all_sessions

        for user in queryset:
            user.status = User.Status.SUSPENDED
            user.suspended_reason = user.suspended_reason or "Suspended by admin"
            user.save(update_fields=["status", "suspended_reason", "updated_at"])
            revoke_all_sessions(user, AuthSession.RevokeReason.ADMIN)

    @admin.action(description="Reactivate selected accounts")
    def reactivate(self, request, queryset):
        queryset.filter(status=User.Status.SUSPENDED).update(status=User.Status.ACTIVE, suspended_reason="", updated_at=timezone.now())


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ["key", "kind", "name_fa", "is_active", "default_enabled", "eligibility", "sort_order"]
    list_editable = ["is_active", "sort_order"]


@admin.register(AppContent)
class AppContentAdmin(admin.ModelAdmin):
    list_display = ["content_key", "lang", "updated_by", "updated_at"]
    readonly_fields = ["updated_by", "version", "updated_at"]

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        if change:
            obj.version += 1
        super().save_model(request, obj, form, change)


@admin.register(LegalDocument)
class LegalDocumentAdmin(admin.ModelAdmin):
    list_display = ["doc_type", "version", "lang", "title", "published_at"]
    list_filter = ["doc_type", "lang"]
    readonly_fields = ["created_by", "created_at"]

    def get_readonly_fields(self, request, obj=None):
        # A published version is frozen; publish a new version instead.
        if obj and obj.published_at:
            return ["doc_type", "version", "lang", "title", "body", "published_at", "created_by", "created_at"]
        return self.readonly_fields

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(AppRelease)
class AppReleaseAdmin(admin.ModelAdmin):
    list_display = ["platform", "version_name", "version_code", "published_at"]


@admin.register(AuthSession)
class AuthSessionAdmin(ReadOnlyAdmin):
    list_display = ["user", "platform", "device_name", "created_at", "last_used_at", "revoked_reason"]
    list_filter = ["platform", "revoked_reason"]
    search_fields = ["user__email"]
    exclude = ["token_hash"]


@admin.register(AuthEvent)
class AuthEventAdmin(ReadOnlyAdmin):
    list_display = ["created_at", "event", "success", "user", "ip"]
    list_filter = ["event", "success"]
    search_fields = ["user__email", "ip"]


@admin.register(EmailOutbox)
class EmailOutboxAdmin(ReadOnlyAdmin):
    list_display = ["created_at", "to_email", "template", "status", "attempts", "sent_at"]
    list_filter = ["status", "template"]
    exclude = ["payload"]


@admin.register(StoredFile)
class StoredFileAdmin(ReadOnlyAdmin):
    list_display = ["id", "owner", "module_key", "size_bytes", "created_at", "deleted_at"]


@admin.register(UserPurgeTask)
class UserPurgeTaskAdmin(ReadOnlyAdmin):
    list_display = ["user_id", "module_key", "status", "attempts", "updated_at"]
    list_filter = ["status", "module_key"]


admin.site.register(UserSettings)
admin.site.register(UserModule)
admin.site.site_header = "Toojibee admin"
admin.site.site_title = "Toojibee"


# ── "Contact us" messages: read and answer here (the live PHP API has the
# same in its own panel, with canned replies). Saving with an answer
# marks it answered and emails it to the person.

SUPPORT_CANNED = [
    ("", "— جواب آماده —"),
    ("سلام، ممنون که وقت گذاشتی و پیشنهادت رو برامون فرستادی. ثبتش کردیم و تو برنامه‌ریزی نسخه‌های بعدی حتماً بررسیش می‌کنیم.\nتیم توجیبی", "تشکر از پیشنهاد"),
    ("سلام، ممنون از صراحتت. انتقادت رو جدی گرفتیم و تیم داره روش کار می‌کنه.\nتیم توجیبی", "تشکر از انتقاد"),
    ("سلام، مشکلی که گفتی رو بررسی کردیم و برطرف شد. لطفاً برنامه رو یه بار ببند و دوباره باز کن.\nتیم توجیبی", "مشکل بررسی شد"),
    ("سلام، پیامت رسید و در حال بررسیه. به‌زودی نتیجه رو همین‌جا بهت می‌گیم.\nتیم توجیبی", "در حال بررسی"),
]


class SupportMessageForm(forms.ModelForm):
    canned = forms.ChoiceField(choices=SUPPORT_CANNED, required=False, label="جواب آماده",
                               help_text="اگه انتخاب بشه و متن جواب خالی باشه، همین فرستاده می‌شه.")

    class Meta:
        model = SupportMessage
        fields = ["status", "reply"]


@admin.register(SupportMessage)
class SupportMessageAdmin(admin.ModelAdmin):
    form = SupportMessageForm
    list_display = ["created_at", "kind", "status", "user", "short_body"]
    list_filter = ["status", "kind"]
    search_fields = ["user__email", "body"]
    readonly_fields = ["user", "kind", "body", "lang", "app_info", "created_at", "replied_at", "user_seen_at"]
    fields = ["user", "kind", "body", "lang", "app_info", "created_at", "canned", "reply", "status", "replied_at", "user_seen_at"]

    @admin.display(description="پیام")
    def short_body(self, obj):
        return obj.body[:80]

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        if not obj.reply and form.cleaned_data.get("canned"):
            obj.reply = form.cleaned_data["canned"]
        answered = "reply" in form.changed_data or (form.cleaned_data.get("canned") and obj.reply)
        if obj.reply and answered:
            obj.replied_at = timezone.now()
            obj.user_seen_at = None
            if obj.status == SupportMessage.Status.OPEN:
                obj.status = SupportMessage.Status.ANSWERED
        super().save_model(request, obj, form, change)
        if obj.reply and answered:
            from .services.email import queue_email
            queue_email(obj.user, EmailOutbox.Template.SUPPORT_REPLY, obj.lang, {"reply": obj.reply, "question": obj.body})
