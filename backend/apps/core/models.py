"""toojibee_core: accounts, sign-in, profile, settings, module registry,
uploaded files, editable content, legal consent and outgoing email."""
import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import MaxValueValidator, RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.common.ids import uuid7

LANG_CHOICES = [("fa", "فارسی"), ("en", "English")]
CALENDAR_CHOICES = [("jalali", "Jalali"), ("gregorian", "Gregorian"), ("hijri", "Hijri")]


# ── accounts ─────────────────────────────────────────────────────────────

class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("email is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  # Google-only account
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Status(models.TextChoices):
        ACTIVE = "active"
        SUSPENDED = "suspended"
        PENDING_DELETION = "pending_deletion"

    # Fully random (uuid4), not time-ordered: an account id says nothing
    # about when it was made or how many came before it.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    suspended_reason = models.CharField(max_length=255, blank=True)
    deletion_requested_at = models.DateTimeField(null=True, blank=True)
    is_staff = models.BooleanField(default=False, help_text="Can sign in to the admin site.")
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"

    class Meta:
        indexes = [models.Index(fields=["status", "deletion_requested_at"], name="core_user_deletion_idx")]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="pending_deletion") | Q(deletion_requested_at__isnull=False),
                name="core_user_deletion_ck",
            ),
        ]

    def __str__(self):
        return self.email

    @property
    def is_active(self):
        # Used by Django's auth backends and the admin login.
        return self.status != self.Status.SUSPENDED

    @property
    def can_use_api(self):
        return self.status == self.Status.ACTIVE


class OAuthAccount(models.Model):
    """Sign-in through an external provider. Phone sign-in would be a new
    provider value here, not a new table."""

    class Provider(models.TextChoices):
        GOOGLE = "google"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="oauth_accounts")
    provider = models.CharField(max_length=20, choices=Provider.choices)
    provider_user_id = models.CharField(max_length=255)
    provider_email = models.EmailField(max_length=254, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_user_id"], name="core_oauth_subject_uq"),
            models.UniqueConstraint(fields=["user", "provider"], name="core_oauth_user_provider_uq"),
        ]


class AuthSession(models.Model):
    """One signed-in device. Holds only the SHA-256 of the refresh token.

    Refresh tokens rotate: each refresh revokes this row ('rotated') and
    creates the next one (replaced_by). Presenting an already-rotated token
    means it was copied, so every session of the user is revoked.
    """

    class Platform(models.TextChoices):
        WEB = "web"
        ANDROID = "android"
        IOS = "ios"

    class RevokeReason(models.TextChoices):
        LOGOUT = "logout"
        LOGOUT_ALL = "logout_all"
        ROTATED = "rotated"
        REUSE_DETECTED = "reuse_detected"
        PASSWORD_CHANGE = "password_change"
        ADMIN = "admin"
        ACCOUNT_DELETED = "account_deleted"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="auth_sessions")
    token_hash = models.CharField(max_length=64, unique=True)
    device_name = models.CharField(max_length=100, blank=True)
    platform = models.CharField(max_length=10, choices=Platform.choices, default=Platform.WEB)
    user_agent = models.CharField(max_length=255, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    last_used_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=20, choices=RevokeReason.choices, blank=True)
    replaced_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        indexes = [
            models.Index(fields=["user", "revoked_at"], name="core_session_user_idx"),
            models.Index(fields=["expires_at"], name="core_session_expiry_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(Q(revoked_at__isnull=True) & Q(revoked_reason="")) | (Q(revoked_at__isnull=False) & ~Q(revoked_reason="")),
                name="core_session_revoked_ck",
            ),
        ]

    @property
    def is_live(self):
        return self.revoked_at is None and self.expires_at > timezone.now()

    def revoke(self, reason):
        if self.revoked_at is None:
            self.revoked_at = timezone.now()
            self.revoked_reason = reason
            self.save(update_fields=["revoked_at", "revoked_reason"])


class AuthToken(models.Model):
    """Single-use links sent by email; only the hash is stored."""

    class Purpose(models.TextChoices):
        VERIFY_EMAIL = "verify_email"
        RESET_PASSWORD = "reset_password"
        CHANGE_EMAIL = "change_email"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="auth_tokens")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    new_email = models.EmailField(max_length=254, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "purpose"], name="core_authtoken_user_idx"),
            models.Index(fields=["expires_at"], name="core_authtoken_expiry_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(purpose="change_email", new_email__gt="") | (~Q(purpose="change_email") & Q(new_email="")),
                name="core_authtoken_email_ck",
            ),
        ]


class AuthEvent(models.Model):
    """Security log and source for rate limits. The attempted email is
    stored only as a SHA-256. Purged after 90 days."""

    class Event(models.TextChoices):
        LOGIN = "login"
        LOGIN_GOOGLE = "login_google"
        LOGOUT = "logout"
        LOGOUT_ALL = "logout_all"
        REGISTER = "register"
        PASSWORD_CHANGE = "password_change"
        PASSWORD_RESET_REQUEST = "password_reset_request"
        PASSWORD_RESET = "password_reset"
        EMAIL_VERIFY = "email_verify"
        SESSION_REUSE = "session_reuse_detected"
        DELETION_REQUEST = "account_deletion_request"
        DELETION_CANCEL = "account_deletion_cancel"

    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    email_hash = models.CharField(max_length=64, blank=True)
    event = models.CharField(max_length=40, choices=Event.choices)
    success = models.BooleanField()
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"], name="core_authevent_user_idx"),
            models.Index(fields=["ip", "created_at"], name="core_authevent_ip_idx"),
            models.Index(fields=["email_hash", "created_at"], name="core_authevent_email_idx"),
            models.Index(fields=["created_at"], name="core_authevent_time_idx"),
        ]


# ── files ────────────────────────────────────────────────────────────────

class StoredFile(models.Model):
    """An uploaded image. Bytes live on disk (storage='local') or, later,
    object storage; moving means copying objects and updating storage /
    storage_key, nothing else refers to the physical location.
    Uploads are re-encoded to WebP before a row is written."""

    class Storage(models.TextChoices):
        LOCAL = "local"
        S3 = "s3"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="files")
    module_key = models.CharField(max_length=40)
    storage = models.CharField(max_length=10, choices=Storage.choices, default=Storage.LOCAL)
    storage_key = models.CharField(max_length=512)
    original_name = models.CharField(max_length=255, blank=True)
    mime = models.CharField(max_length=40, default="image/webp")
    size_bytes = models.PositiveIntegerField(validators=[MaxValueValidator(3 * 1024 * 1024)])
    width = models.PositiveSmallIntegerField(null=True, blank=True)
    height = models.PositiveSmallIntegerField(null=True, blank=True)
    sha256 = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["owner", "module_key"], name="core_file_owner_idx"),
            models.Index(fields=["deleted_at"], name="core_file_deleted_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["storage", "storage_key"], name="core_file_location_uq"),
            models.CheckConstraint(condition=Q(size_bytes__gte=1, size_bytes__lte=3 * 1024 * 1024), name="core_file_size_ck"),
        ]


# ── profile & settings ───────────────────────────────────────────────────

username_validator = RegexValidator(r"^[a-z0-9_.]{3,30}$", "3-30 lowercase letters, digits, _ or .")
phone_validator = RegexValidator(r"^\+[1-9][0-9]{6,14}$", "International format, e.g. +989121234567")
public_id_validator = RegexValidator(r"^[A-Z0-9]{8}$")


class Profile(models.Model):
    class Gender(models.TextChoices):
        FEMALE = "female"
        MALE = "male"

    user = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, related_name="profile")
    first_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    username = models.CharField(max_length=30, unique=True, null=True, blank=True, validators=[username_validator])
    public_id = models.CharField(max_length=8, unique=True, validators=[public_id_validator])
    phone = models.CharField(max_length=16, unique=True, null=True, blank=True, validators=[phone_validator])
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    avatar = models.ForeignKey(StoredFile, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip() or self.public_id

    @property
    def display_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.username or "Toojibee user"


class UserSettings(models.Model):
    class WeekStart(models.TextChoices):
        SATURDAY = "saturday"
        SUNDAY = "sunday"
        MONDAY = "monday"

    class Theme(models.TextChoices):
        SYSTEM = "system"
        DARK = "dark"
        LIGHT = "light"

    class Palette(models.TextChoices):
        TOOJIBEE = "toojibee", "Toojibee (olive / orange)"
        CLASSIC = "classic", "Classic (navy / orange)"

    # Per-desktop display options (the gear on each Management card).
    # Stored as one JSON object so a new switch needs no migration; only
    # these keys are accepted (SettingsSerializer.validate_preferences)
    # and missing keys read as these defaults.
    PREFERENCE_DEFAULTS = {
        "planning_day_summary": True,       # the "Day summary" progress card
        "planning_calendar_dots": True,     # dot under days that have plans
        "planning_show_events": True,
        "planning_show_habits": True,
        "occasions_enabled": True,          # the Occasions desktop itself
        "occasions_jalali": True,           # Iranian (solar) occasions
        "occasions_hijri": True,            # religious (lunar) occasions
        "occasions_gregorian": True,        # international days
        "occasions_holidays_only": False,
        "occasions_mark_holidays": True,    # holidays in red on the calendar
        "occasions_show_events": True,      # my events under the occasions
    }

    user = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, related_name="settings")
    language = models.CharField(max_length=2, choices=LANG_CHOICES, default="fa")
    timezone = models.CharField(max_length=64, default="Asia/Tehran")
    calendar_primary = models.CharField(max_length=10, choices=CALENDAR_CHOICES, default="jalali")
    calendars_enabled = models.CharField(max_length=40, default="jalali,gregorian,hijri")
    week_start = models.CharField(max_length=10, choices=WeekStart.choices, default=WeekStart.SATURDAY)
    theme = models.CharField(max_length=10, choices=Theme.choices, default=Theme.SYSTEM)
    palette = models.CharField(max_length=10, choices=Palette.choices, default=Palette.TOOJIBEE)
    preferences = models.JSONField(default=dict, blank=True)
    notifications_enabled = models.BooleanField(default=True)
    show_add_menu_labels = models.BooleanField(default=True)
    discoverable_by_username = models.BooleanField(default=True)
    discoverable_by_phone = models.BooleanField(default=False)
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def calendars_enabled_list(self):
        return [c for c in self.calendars_enabled.split(",") if c]

    @property
    def effective_preferences(self):
        prefs = dict(self.PREFERENCE_DEFAULTS)
        prefs.update({k: v for k, v in (self.preferences or {}).items() if k in self.PREFERENCE_DEFAULTS})
        return prefs


# ── modules (desktops and toggleable features) ──────────────────────────

class Module(models.Model):
    """The registry that makes the app extensible: a new desktop is a new
    row here plus its own Django app and database."""

    class Kind(models.TextChoices):
        DESKTOP = "desktop"
        FEATURE = "feature"

    class Eligibility(models.TextChoices):
        EVERYONE = "everyone"
        GENDER_FEMALE = "gender_female"

    key = models.CharField(max_length=40, primary_key=True, validators=[RegexValidator(r"^[a-z][a-z0-9_]{1,39}$")])
    kind = models.CharField(max_length=10, choices=Kind.choices)
    name_fa = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    description_fa = models.CharField(max_length=255, blank=True)
    description_en = models.CharField(max_length=255, blank=True)
    database_alias = models.CharField(max_length=40, blank=True, help_text="Empty for modules without their own data.")
    eligibility = models.CharField(max_length=20, choices=Eligibility.choices, default=Eligibility.EVERYONE)
    default_enabled = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, help_text="Off hides the module from everyone.")
    sort_order = models.SmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return self.key

    def is_eligible(self, profile):
        if self.eligibility == self.Eligibility.GENDER_FEMALE:
            return profile is not None and profile.gender == Profile.Gender.FEMALE
        return True


class UserModule(models.Model):
    """Turning a desktop off keeps its data; data_purged_at records an
    explicit "delete this desktop's data"."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="modules")
    module = models.ForeignKey(Module, on_delete=models.PROTECT, related_name="+")
    enabled = models.BooleanField()
    position = models.SmallIntegerField(default=0)
    enabled_at = models.DateTimeField(null=True, blank=True)
    disabled_at = models.DateTimeField(null=True, blank=True)
    data_purged_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "module"], name="core_usermodule_uq")]


class UserPurgeTask(models.Model):
    """Account deletion across databases: one row per module, processed by
    `manage.py purge_accounts`. No FK to User on purpose, these rows must
    outlive the user row, which is deleted last."""

    class Status(models.TextChoices):
        PENDING = "pending"
        DONE = "done"
        FAILED = "failed"

    user_id = models.UUIDField()
    module_key = models.CharField(max_length=40)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user_id", "module_key"], name="core_purgetask_uq")]
        indexes = [models.Index(fields=["status", "updated_at"], name="core_purgetask_status_idx")]


# ── content, legal, releases ─────────────────────────────────────────────

class AppContent(models.Model):
    """Short admin-editable texts, e.g. the About page. Empty body = the
    app's built-in default."""

    content_key = models.CharField(max_length=60)
    lang = models.CharField(max_length=2, choices=LANG_CHOICES)
    body = models.TextField(blank=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["content_key", "lang"], name="core_appcontent_uq")]
        verbose_name_plural = "app content"

    def __str__(self):
        return f"{self.content_key} ({self.lang})"


class LegalDocument(models.Model):
    """Privacy policy and terms, versioned. Once published a version is
    never edited; a change is a new version that users accept again."""

    class DocType(models.TextChoices):
        PRIVACY = "privacy"
        TERMS = "terms"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    doc_type = models.CharField(max_length=10, choices=DocType.choices)
    version = models.PositiveSmallIntegerField()
    lang = models.CharField(max_length=2, choices=LANG_CHOICES)
    title = models.CharField(max_length=200)
    body = models.TextField()
    published_at = models.DateTimeField(null=True, blank=True, help_text="Empty = draft.")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["doc_type", "version", "lang"], name="core_legaldoc_version_uq")]
        ordering = ["doc_type", "-version"]

    def __str__(self):
        return f"{self.doc_type} v{self.version} ({self.lang})"


class UserConsent(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="consents")
    doc_type = models.CharField(max_length=10, choices=LegalDocument.DocType.choices)
    version = models.PositiveSmallIntegerField()
    accepted_at = models.DateTimeField(default=timezone.now)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "doc_type", "version"], name="core_consent_uq")]


class AppRelease(models.Model):
    """Android builds offered on the landing site's download page."""

    class Platform(models.TextChoices):
        ANDROID = "android"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    platform = models.CharField(max_length=10, choices=Platform.choices, default=Platform.ANDROID)
    version_name = models.CharField(max_length=20)
    version_code = models.PositiveIntegerField()
    download_url = models.URLField(max_length=500)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64, validators=[RegexValidator(r"^[0-9a-f]{64}$")])
    min_os = models.CharField(max_length=20, blank=True)
    changelog_fa = models.TextField(blank=True)
    changelog_en = models.TextField(blank=True)
    published_at = models.DateTimeField(null=True, blank=True, help_text="Empty = not public yet.")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["platform", "version_code"], name="core_release_code_uq")]
        ordering = ["-version_code"]

    def __str__(self):
        return f"{self.platform} {self.version_name}"


# ── outgoing email ───────────────────────────────────────────────────────

class EmailOutbox(models.Model):
    """Emails are queued and sent by `manage.py send_emails` with retries.
    payload (which holds the one-time link) is cleared once sent."""

    class Template(models.TextChoices):
        VERIFY_EMAIL = "verify_email"
        RESET_PASSWORD = "reset_password"
        CHANGE_EMAIL = "change_email"
        DELETION_SCHEDULED = "account_deletion_scheduled"
        ACCOUNT_DELETED = "account_deleted"

    class Status(models.TextChoices):
        PENDING = "pending"
        SENDING = "sending"
        SENT = "sent"
        FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    to_email = models.EmailField(max_length=254)
    template = models.CharField(max_length=40, choices=Template.choices)
    lang = models.CharField(max_length=2, choices=LANG_CHOICES, default="fa")
    payload = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    last_error = models.CharField(max_length=500, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        indexes = [models.Index(fields=["status", "next_attempt_at"], name="core_outbox_queue_idx")]
        verbose_name_plural = "email outbox"
