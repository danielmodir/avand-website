from django.conf import settings
from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import check_version
from apps.common.exceptions import ApiError

from . import serializers as s
from .models import AppContent, AppRelease, AuthSession, LegalDocument, Module, Profile, StoredFile, UserModule, UserSettings
from .services import accounts
from .services.files import delete_physical, file_path, store_image


class PublicView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


# ── auth ─────────────────────────────────────────────────────────────────

class RegisterView(PublicView):
    throttle_scope = "register"

    def post(self, request):
        data = s.RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        user = accounts.register(request, v["email"], v["password"], v.get("first_name", ""), v.get("last_name", ""), v.get("consents"))
        return Response(accounts.start_session(user, request, v), status=status.HTTP_201_CREATED)


class LoginView(PublicView):
    throttle_scope = "login"

    def post(self, request):
        data = s.LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = accounts.authenticate_password(request, data.validated_data["email"], data.validated_data["password"])
        return Response(accounts.start_session(user, request, data.validated_data))


class GoogleLoginView(PublicView):
    throttle_scope = "login"

    def post(self, request):
        data = s.GoogleLoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not settings.GOOGLE_CLIENT_IDS:
            raise ApiError("google_sign_in_disabled", 503)
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        try:
            claims = id_token.verify_oauth2_token(data.validated_data["id_token"], google_requests.Request())
        except ValueError:
            raise ApiError("invalid_google_token", 401)
        if claims.get("aud") not in settings.GOOGLE_CLIENT_IDS:
            raise ApiError("invalid_google_token", 401)
        user = accounts.google_sign_in(request, claims)
        return Response(accounts.start_session(user, request, data.validated_data))


class RefreshView(PublicView):
    throttle_scope = "refresh"

    def post(self, request):
        data = s.RefreshSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(accounts.rotate_session(data.validated_data["refresh_token"], request))


class LogoutView(APIView):
    def post(self, request):
        request.auth.revoke(AuthSession.RevokeReason.LOGOUT)
        accounts.log_event(request, "logout", True, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LogoutAllView(APIView):
    def post(self, request):
        accounts.revoke_all_sessions(request.user, AuthSession.RevokeReason.LOGOUT_ALL)
        accounts.log_event(request, "logout_all", True, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionListView(APIView):
    def get(self, request):
        sessions = AuthSession.objects.filter(user=request.user, revoked_at__isnull=True, expires_at__gt=timezone.now()).order_by("-last_used_at")
        return Response(s.SessionSerializer(sessions, many=True, context={"current_session": request.auth}).data)


class SessionDetailView(APIView):
    def delete(self, request, session_id):
        session = AuthSession.objects.filter(user=request.user, id=session_id, revoked_at__isnull=True).first()
        if session is None:
            raise Http404
        session.revoke(AuthSession.RevokeReason.LOGOUT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class VerifyEmailView(PublicView):
    def post(self, request):
        data = s.TokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        accounts.verify_email(request, data.validated_data["token"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResendVerificationView(APIView):
    throttle_scope = "password_reset"

    def post(self, request):
        accounts.send_email_verification(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordForgotView(PublicView):
    throttle_scope = "password_reset"

    def post(self, request):
        data = s.EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        accounts.request_password_reset(request, data.validated_data["email"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetView(PublicView):
    throttle_scope = "password_reset"

    def post(self, request):
        data = s.PasswordResetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        accounts.reset_password(request, data.validated_data["token"], data.validated_data["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeView(APIView):
    def post(self, request):
        data = s.PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        accounts.change_password(request, request.user, v.get("current_password"), v["new_password"], keep_session=request.auth)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountDeletionView(APIView):
    """Schedules deletion after a 30-day grace period and signs out every
    device. Signing in again before then cancels it."""

    def post(self, request):
        return Response({"purge_on": accounts.request_deletion(request, request.user)}, status=status.HTTP_202_ACCEPTED)


# ── me ───────────────────────────────────────────────────────────────────

def _modules_for(user):
    profile = getattr(user, "profile", None)
    rows = UserModule.objects.filter(user=user, module__is_active=True).select_related("module").order_by("position")
    return [m for m in rows if m.module.is_eligible(profile)]


class MeView(APIView):
    """Everything the app needs at start-up in one request."""

    def get(self, request):
        user = request.user
        return Response({
            "id": str(user.id),
            "status": user.status,
            "deletion_requested_at": user.deletion_requested_at,
            "profile": s.ProfileSerializer(user.profile).data,
            "settings": s.SettingsSerializer(user.settings).data,
            "modules": s.UserModuleSerializer(_modules_for(user), many=True).data,
            "consents": list(user.consents.values("doc_type", "version", "accepted_at")),
        })


class ProfileView(APIView):
    def get(self, request):
        return Response(s.ProfileSerializer(request.user.profile).data)

    @transaction.atomic
    def patch(self, request):
        profile = Profile.objects.select_for_update().get(user=request.user)
        check_version(profile, request.data.get("version"), s.ProfileSerializer)
        data = s.ProfileSerializer(profile, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save(version=profile.version + 1)
        return Response(data.data)


class UsernameAvailableView(APIView):
    throttle_scope = "search"

    def get(self, request):
        username = (request.query_params.get("username") or "").lower()
        taken = Profile.objects.filter(username=username).exclude(user=request.user).exists()
        return Response({"username": username, "available": bool(username) and not taken})


class SettingsView(APIView):
    def get(self, request):
        return Response(s.SettingsSerializer(request.user.settings).data)

    @transaction.atomic
    def patch(self, request):
        row = UserSettings.objects.select_for_update().get(user=request.user)
        check_version(row, request.data.get("version"), s.SettingsSerializer)
        data = s.SettingsSerializer(row, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save(version=row.version + 1)
        return Response(data.data)


class ModuleListView(APIView):
    def get(self, request):
        return Response(s.UserModuleSerializer(_modules_for(request.user), many=True).data)


class ModuleDetailView(APIView):
    @transaction.atomic
    def patch(self, request, key):
        module = Module.objects.filter(key=key, is_active=True).first()
        if module is None or not module.is_eligible(getattr(request.user, "profile", None)):
            raise Http404
        row, _ = UserModule.objects.select_for_update().get_or_create(user=request.user, module=module, defaults={"enabled": False})
        data = s.UserModuleSerializer(row, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        changes = {"version": row.version + 1}
        if "enabled" in data.validated_data and data.validated_data["enabled"] != row.enabled:
            changes["enabled_at" if data.validated_data["enabled"] else "disabled_at"] = timezone.now()
        data.save(**changes)
        return Response(data.data)


class ModulePurgeView(APIView):
    """Deletes this user's data in one module; the desktop stays."""

    def post(self, request, key):
        if key not in settings.PURGE_HANDLERS:
            raise Http404
        from .services.purge import purge_module_data

        purge_module_data(request.user.id, key)
        UserModule.objects.filter(user=request.user, module_id=key).update(data_purged_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConsentView(APIView):
    def post(self, request):
        data = s.ConsentSerializer(data=request.data, many=True)
        data.is_valid(raise_exception=True)
        for c in data.validated_data:
            if not LegalDocument.objects.filter(doc_type=c["doc_type"], version=c["version"], published_at__isnull=False).exists():
                raise ApiError("unknown_document_version")
        accounts.record_consents(request.user, data.validated_data, request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvatarView(APIView):
    throttle_scope = "upload"

    @transaction.atomic
    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise ApiError("file_required")
        stored = store_image(request.user, upload, "core")
        profile = Profile.objects.select_for_update().get(user=request.user)
        old = profile.avatar
        profile.avatar = stored
        profile.version += 1
        profile.save(update_fields=["avatar", "version", "updated_at"])
        if old:
            old.deleted_at = timezone.now()
            old.save(update_fields=["deleted_at"])
        return Response({"avatar_file_id": str(stored.id)}, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def delete(self, request):
        profile = Profile.objects.select_for_update().get(user=request.user)
        if profile.avatar:
            StoredFile.objects.filter(pk=profile.avatar_id).update(deleted_at=timezone.now())
            profile.avatar = None
            profile.version += 1
            profile.save(update_fields=["avatar", "version", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── files ────────────────────────────────────────────────────────────────

class FileUploadView(APIView):
    throttle_scope = "upload"

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise ApiError("file_required")
        stored = store_image(request.user, upload, request.data.get("module") or "planning")
        return Response({"id": str(stored.id), "width": stored.width, "height": stored.height, "size_bytes": stored.size_bytes}, status=status.HTTP_201_CREATED)


class FileDetailView(APIView):
    """Files are private: only the owner can read them."""

    def get(self, request, file_id):
        stored = StoredFile.objects.filter(id=file_id, owner=request.user, deleted_at__isnull=True).first()
        if stored is None or not file_path(stored).exists():
            raise Http404
        response = FileResponse(open(file_path(stored), "rb"), content_type=stored.mime)
        response["Cache-Control"] = "private, max-age=86400"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def delete(self, request, file_id):
        stored = StoredFile.objects.filter(id=file_id, owner=request.user, deleted_at__isnull=True).first()
        if stored is None:
            raise Http404
        stored.deleted_at = timezone.now()
        stored.save(update_fields=["deleted_at"])
        delete_physical(stored)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── public content ───────────────────────────────────────────────────────

def _lang(request):
    lang = request.query_params.get("lang", "fa")
    return lang if lang in ("fa", "en") else "fa"


class ContentView(PublicView):
    def get(self, request, key):
        row = AppContent.objects.filter(content_key=key, lang=_lang(request)).first()
        if row is None:
            raise Http404
        return Response({"key": key, "lang": row.lang, "body": row.body, "version": row.version, "updated_at": row.updated_at})


class LegalDocumentView(PublicView):
    def get(self, request, doc_type):
        doc = LegalDocument.objects.filter(doc_type=doc_type, lang=_lang(request), published_at__isnull=False).order_by("-version").first()
        if doc is None:
            raise Http404
        return Response(s.LegalDocumentSerializer(doc).data)


class LatestReleaseView(PublicView):
    def get(self, request, platform):
        release = AppRelease.objects.filter(platform=platform, published_at__isnull=False, published_at__lte=timezone.now()).order_by("-version_code").first()
        if release is None:
            raise Http404
        return Response(s.AppReleaseSerializer(release).data)
