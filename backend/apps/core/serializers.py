import zoneinfo

from rest_framework import serializers

from .models import AppRelease, AuthSession, LegalDocument, Profile, UserModule, UserSettings

CALENDARS = {"jalali", "gregorian", "hijri"}


class ConsentSerializer(serializers.Serializer):
    doc_type = serializers.ChoiceField(choices=LegalDocument.DocType.choices)
    version = serializers.IntegerField(min_value=1)


class SessionMetaSerializer(serializers.Serializer):
    platform = serializers.ChoiceField(choices=AuthSession.Platform.choices, required=False)
    device_name = serializers.CharField(max_length=100, required=False, allow_blank=True)


class RegisterSerializer(SessionMetaSerializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    first_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    consents = ConsentSerializer(many=True, required=False)


class LoginSerializer(SessionMetaSerializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class GoogleLoginSerializer(SessionMetaSerializer):
    id_token = serializers.CharField(max_length=4096)


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField(max_length=200)


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)


class PasswordResetSerializer(TokenSerializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False, required=False, allow_blank=True)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class SessionSerializer(serializers.ModelSerializer):
    current = serializers.SerializerMethodField()

    class Meta:
        model = AuthSession
        fields = ["id", "device_name", "platform", "user_agent", "created_at", "last_used_at", "current"]

    def get_current(self, obj):
        current = self.context.get("current_session")
        return current is not None and obj.pk == current.pk


class ProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    email_verified = serializers.SerializerMethodField()
    avatar_file_id = serializers.UUIDField(source="avatar_id", read_only=True)
    version = serializers.IntegerField(required=False)

    class Meta:
        model = Profile
        fields = [
            "first_name", "last_name", "username", "public_id", "phone", "gender", "birth_date",
            "avatar_file_id", "email", "email_verified", "version", "updated_at",
        ]
        read_only_fields = ["public_id", "updated_at"]

    def get_email_verified(self, obj):
        return obj.user.email_verified_at is not None

    def validate_username(self, value):
        return value.lower() if value else None

    def validate_phone(self, value):
        return value or None


class SettingsSerializer(serializers.ModelSerializer):
    calendars_enabled = serializers.ListField(child=serializers.ChoiceField(choices=sorted(CALENDARS)), allow_empty=False)
    version = serializers.IntegerField(required=False)

    class Meta:
        model = UserSettings
        exclude = ["user"]
        read_only_fields = ["updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["calendars_enabled"] = instance.calendars_enabled_list
        return data

    def validate_timezone(self, value):
        if value not in zoneinfo.available_timezones():
            raise serializers.ValidationError("Unknown IANA timezone.")
        return value

    def validate(self, attrs):
        enabled = attrs.get("calendars_enabled", self.instance.calendars_enabled_list if self.instance else None)
        primary = attrs.get("calendar_primary", self.instance.calendar_primary if self.instance else None)
        if enabled is not None and primary not in enabled:
            raise serializers.ValidationError({"calendar_primary": "Must be one of the enabled calendars."})
        if "calendars_enabled" in attrs:
            attrs["calendars_enabled"] = ",".join(c for c in ("jalali", "gregorian", "hijri") if c in attrs["calendars_enabled"])
        return attrs


class UserModuleSerializer(serializers.ModelSerializer):
    key = serializers.CharField(source="module.key", read_only=True)
    kind = serializers.CharField(source="module.kind", read_only=True)
    name_fa = serializers.CharField(source="module.name_fa", read_only=True)
    name_en = serializers.CharField(source="module.name_en", read_only=True)

    class Meta:
        model = UserModule
        fields = ["key", "kind", "name_fa", "name_en", "enabled", "position", "data_purged_at", "version"]
        read_only_fields = ["data_purged_at", "version"]


class LegalDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalDocument
        fields = ["doc_type", "version", "lang", "title", "body", "published_at"]


class AppReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppRelease
        fields = ["platform", "version_name", "version_code", "download_url", "size_bytes", "sha256", "min_os", "changelog_fa", "changelog_en", "published_at"]
