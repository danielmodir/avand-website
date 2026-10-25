"""Account lifecycle and sign-in sessions."""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.exceptions import ApiError

from ..models import (
    AuthEvent, AuthSession, AuthToken, EmailOutbox, Module, OAuthAccount, Profile, User, UserConsent,
    UserModule, UserSettings,
)
from ..security import client_ip, email_hash, new_secret_token, sha256_hex, user_agent
from ..tokens import issue_access_token
from .email import queue_email


def check_password_strength(password, user):
    """Django's validators (8+ characters, not common, not all digits…)
    plus the app's own rule: at least one letter and at least one digit
    or symbol."""
    reasons = []
    try:
        password_validation.validate_password(password, user)
    except ValidationError as exc:
        reasons = list(exc.messages)
    if not re.search(r"[^\W\d_]", password) or not re.search(r"[\d\W_]", password):
        reasons.append("Password must contain a letter and a number or symbol.")
    if reasons:
        raise ApiError("weak_password", 400, extra={"reasons": reasons})


# ── audit ────────────────────────────────────────────────────────────────

def log_event(request, event, success, user=None, email=""):
    AuthEvent.objects.create(
        user=user, email_hash=email_hash(email) if email else "", event=event, success=success,
        ip=client_ip(request), user_agent=user_agent(request),
    )


# ── sessions ─────────────────────────────────────────────────────────────

def _session_meta(request, data):
    platform = (data or {}).get("platform") or AuthSession.Platform.WEB
    if platform not in AuthSession.Platform.values:
        platform = AuthSession.Platform.WEB
    return {
        "platform": platform,
        "device_name": str((data or {}).get("device_name") or "")[:100],
        "user_agent": user_agent(request),
        "ip": client_ip(request),
    }


def start_session(user, request, data=None):
    """Returns the token pair for a new signed-in device."""
    refresh = new_secret_token()
    session = AuthSession.objects.create(
        user=user, token_hash=sha256_hex(refresh),
        expires_at=timezone.now() + settings.REFRESH_TOKEN_LIFETIME, **_session_meta(request, data),
    )
    User.objects.filter(pk=user.pk).update(last_login=timezone.now())
    return token_pair(session, refresh)


def token_pair(session, refresh):
    return {
        "access_token": issue_access_token(session),
        "refresh_token": refresh,
        "access_expires_in": int(settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
        "session_id": str(session.id),
        "user_id": str(session.user_id),
    }


def rotate_session(refresh_token, request):
    replayed = None
    with transaction.atomic():
        result = _rotate(refresh_token, request)
        if isinstance(result, User):
            replayed = result
    if replayed is not None:
        # A refresh token that was already exchanged is being replayed:
        # someone copied it. Sign the user out everywhere. Done after the
        # block so the revocation is committed, not rolled back with the
        # failed request.
        revoke_all_sessions(replayed, AuthSession.RevokeReason.REUSE_DETECTED)
        log_event(request, AuthEvent.Event.SESSION_REUSE, False, replayed)
        raise ApiError("invalid_refresh_token", 401)
    return result


def _rotate(refresh_token, request):
    """Token pair for a valid refresh token; the User if it was replayed."""
    session = AuthSession.objects.select_for_update().select_related("user").filter(token_hash=sha256_hex(refresh_token or "")).first()
    if session is None:
        raise ApiError("invalid_refresh_token", 401)
    if session.revoked_at is not None:
        if session.revoked_reason == AuthSession.RevokeReason.ROTATED:
            return session.user
        raise ApiError("invalid_refresh_token", 401)
    if session.expires_at <= timezone.now():
        raise ApiError("refresh_token_expired", 401)
    if not session.user.can_use_api:
        raise ApiError(f"account_{session.user.status}", 403)

    refresh = new_secret_token()
    successor = AuthSession.objects.create(
        user=session.user, token_hash=sha256_hex(refresh), expires_at=timezone.now() + settings.REFRESH_TOKEN_LIFETIME,
        platform=session.platform, device_name=session.device_name, user_agent=user_agent(request), ip=client_ip(request),
    )
    session.revoked_at = timezone.now()
    session.revoked_reason = AuthSession.RevokeReason.ROTATED
    session.replaced_by = successor
    session.save(update_fields=["revoked_at", "revoked_reason", "replaced_by"])
    return token_pair(successor, refresh)


def revoke_all_sessions(user, reason, except_session=None):
    qs = AuthSession.objects.filter(user=user, revoked_at__isnull=True)
    if except_session is not None:
        qs = qs.exclude(pk=except_session.pk)
    qs.update(revoked_at=timezone.now(), revoked_reason=reason)


# ── registration ─────────────────────────────────────────────────────────

# Crockford base32: no I, L, O, U (nothing to misread when it's shared).
PUBLIC_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def generate_public_id(first_name=None, email=None):
    """The short code people share to find each other (shown as TJ-XXXXXXXX):
    8 characters from a CSPRNG, nothing derived from the name, email or
    sign-up order."""
    while True:
        candidate = "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(8))
        if not Profile.objects.filter(public_id=candidate).exists():
            return candidate


def provision_user(user, first_name="", last_name="", username=None, gender=None, birth_date=None):
    """Profile, settings and default desktops for a brand-new account."""
    Profile.objects.create(
        user=user, first_name=first_name[:60], last_name=last_name[:60], public_id=generate_public_id(),
        username=username, gender=gender, birth_date=birth_date,
    )
    UserSettings.objects.create(user=user)
    now = timezone.now()
    for position, module in enumerate(Module.objects.filter(is_active=True, default_enabled=True)):
        UserModule.objects.create(user=user, module=module, enabled=True, position=position, enabled_at=now)


def record_consents(user, consents, request):
    """consents: [{"doc_type": "terms", "version": 3}, …]"""
    for c in consents or []:
        UserConsent.objects.get_or_create(
            user=user, doc_type=c["doc_type"], version=c["version"], defaults={"ip": client_ip(request)},
        )


@transaction.atomic
def register(request, email, password, first_name="", last_name="", consents=None, username=None, gender=None, birth_date=None):
    email = User.objects.normalize_email(email).lower()
    candidate = User(email=email)
    check_password_strength(password, candidate)
    if username and Profile.objects.filter(username=username).exists():
        raise ApiError("username_taken", 409)
    try:
        with transaction.atomic():
            user = User.objects.create_user(email, password)
    except IntegrityError:
        log_event(request, AuthEvent.Event.REGISTER, False, email=email)
        raise ApiError("email_taken", 409)
    provision_user(user, first_name, last_name, username, gender, birth_date)
    record_consents(user, consents, request)
    # The email is confirmed with a code before the first sign-in (the
    # owner brought the step back, 2026-10-25): no session until then.
    send_verify_code(user)
    log_event(request, AuthEvent.Event.REGISTER, True, user)
    return user


def send_verify_code(user):
    """A 6-digit code to confirm the address; at most one a minute."""
    recent = AuthToken.objects.filter(user=user, purpose=AuthToken.Purpose.VERIFY_CODE, used_at__isnull=True,
                                      created_at__gt=timezone.now() - timedelta(minutes=1)).exists()
    if not recent:
        code = _issue_code(user, AuthToken.Purpose.VERIFY_CODE)
        queue_email(user, EmailOutbox.Template.VERIFY_EMAIL, _lang(user), {"code": code})


def resend_verify_code(request, email):
    """Always succeeds from the caller's point of view (no account probing)."""
    user = User.objects.filter(email=(email or "").strip().lower()).first()
    if user and user.email_verified_at is None and user.status != User.Status.SUSPENDED:
        send_verify_code(user)


def verify_email_code(request, email, code):
    """The code from the sign-up email: confirms the address and returns the
    user to start a session for. A wrong try is counted even though it fails
    (raised outside the transaction, like exchange_reset_code)."""
    user = User.objects.filter(email=(email or "").strip().lower()).first()
    if user is None or user.status == User.Status.SUSPENDED or user.email_verified_at is not None:
        raise ApiError("code_expired", 400)  # same as an address with no live code
    with transaction.atomic():
        try:
            _check_code(user, AuthToken.Purpose.VERIFY_CODE, clean_code(code))
        except ApiError as e:
            error = e
        else:
            error = None
            User.objects.filter(pk=user.pk).update(email_verified_at=timezone.now())
            log_event(request, AuthEvent.Event.EMAIL_VERIFY, True, user)
    if error:
        raise error
    return user


def authenticate_password(request, email, password):
    email = (email or "").strip().lower()
    user = User.objects.filter(email=email).first()
    # Hash something even for unknown emails so timing doesn't reveal them.
    valid = user.check_password(password) if user else User().check_password(password)
    if not user or not valid or not user.has_usable_password():
        log_event(request, AuthEvent.Event.LOGIN, False, user, email)
        raise ApiError("invalid_credentials", 401)
    if user.status == User.Status.SUSPENDED:
        log_event(request, AuthEvent.Event.LOGIN, False, user)
        raise ApiError("account_suspended", 403)
    # Not confirmed yet (also accounts from before 2026-10-25): a code
    # goes out and the app asks for it.
    if user.email_verified_at is None:
        send_verify_code(user)
        raise ApiError("email_not_verified", 403)
    log_event(request, AuthEvent.Event.LOGIN, True, user)
    _cancel_deletion_on_sign_in(request, user)
    return user


@transaction.atomic
def google_sign_in(request, claims):
    """claims: a verified Google ID token (see views.GoogleLoginView)."""
    subject, email = claims["sub"], (claims.get("email") or "").lower()
    link = OAuthAccount.objects.select_related("user").filter(provider="google", provider_user_id=subject).first()
    if link:
        user = link.user
        link.last_used_at = timezone.now()
        link.save(update_fields=["last_used_at"])
    else:
        if not email or not claims.get("email_verified"):
            raise ApiError("google_email_unverified", 400)
        user = User.objects.filter(email=email).first()
        if user is None:
            user = User.objects.create_user(email, None, email_verified_at=timezone.now())
            provision_user(user, claims.get("given_name", ""), claims.get("family_name", ""))
        OAuthAccount.objects.create(user=user, provider="google", provider_user_id=subject, provider_email=email, last_used_at=timezone.now())
    if user.status == User.Status.SUSPENDED:
        raise ApiError("account_suspended", 403)
    log_event(request, AuthEvent.Event.LOGIN_GOOGLE, True, user)
    _cancel_deletion_on_sign_in(request, user)
    return user


# ── email links ──────────────────────────────────────────────────────────

def _issue_link_token(user, purpose, lifetime, new_email=""):
    AuthToken.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=timezone.now())
    raw = new_secret_token()
    AuthToken.objects.create(
        user=user, purpose=purpose, token_hash=sha256_hex(raw), new_email=new_email,
        expires_at=timezone.now() + lifetime,
    )
    return raw


def _lang(user):
    settings_row = getattr(user, "settings", None)
    return settings_row.language if settings_row else "fa"


# ── one-time email codes (same rules as backend-php/lib/auth.php) ────────
CODE_LIFETIME = timedelta(minutes=10)
CODE_TRIES = 5
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def _code_hash(user_id, purpose, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{user_id}|{purpose}|{code}".encode(), hashlib.sha256).hexdigest()


def clean_code(value):
    return re.sub(r"\D", "", str(value or "").translate(_DIGITS))


def _issue_code(user, purpose):
    code = f"{secrets.randbelow(1_000_000):06d}"
    AuthToken.objects.filter(user=user, purpose=purpose).delete()
    AuthToken.objects.create(user=user, purpose=purpose, token_hash=_code_hash(user.pk, purpose, code),
                             expires_at=timezone.now() + CODE_LIFETIME)
    return code


def _check_code(user, purpose, code):
    """Uses up the code, or raises invalid_code / code_expired."""
    token = AuthToken.objects.select_for_update().filter(user=user, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now()).first()
    if token is None or token.attempts >= CODE_TRIES:
        raise ApiError("code_expired", 400)
    if len(code) != 6 or not hmac.compare_digest(token.token_hash, _code_hash(user.pk, purpose, code)):
        token.attempts += 1
        token.save(update_fields=["attempts"])
        raise ApiError("code_expired" if token.attempts >= CODE_TRIES else "invalid_code", 400)
    token.used_at = timezone.now()
    token.save(update_fields=["used_at"])


def exchange_reset_code(request, email, code):
    """Code from the reset email -> a short-lived token for reset_password."""
    user = User.objects.filter(email=(email or "").strip().lower()).first()
    if user is None or user.status == User.Status.SUSPENDED:
        raise ApiError("code_expired", 400)  # same as an address with no live code
    with transaction.atomic():
        try:
            _check_code(user, AuthToken.Purpose.RESET_CODE, clean_code(code))
        except ApiError as e:
            error = e
        else:
            error = None
            raw = _issue_link_token(user, AuthToken.Purpose.RESET_PASSWORD, timedelta(minutes=15))
    if error:
        raise error
    return raw


def consume_link_token(raw, purpose):
    token = AuthToken.objects.select_for_update().select_related("user").filter(token_hash=sha256_hex(raw or ""), purpose=purpose).first()
    if token is None or token.used_at is not None or token.expires_at <= timezone.now():
        raise ApiError("invalid_or_expired_token", 400)
    token.used_at = timezone.now()
    token.save(update_fields=["used_at"])
    return token


@transaction.atomic
def verify_email(request, raw):
    token = consume_link_token(raw, AuthToken.Purpose.VERIFY_EMAIL)
    User.objects.filter(pk=token.user_id).update(email_verified_at=timezone.now())
    log_event(request, AuthEvent.Event.EMAIL_VERIFY, True, token.user)


def request_password_reset(request, email):
    """Always succeeds from the caller's point of view (no account probing)."""
    user = User.objects.filter(email=(email or "").strip().lower()).first()
    log_event(request, AuthEvent.Event.PASSWORD_RESET_REQUEST, bool(user), user, email)
    if user and user.status != User.Status.SUSPENDED:
        code = _issue_code(user, AuthToken.Purpose.RESET_CODE)
        queue_email(user, EmailOutbox.Template.RESET_PASSWORD, _lang(user), {"code": code})


@transaction.atomic
def reset_password(request, raw, new_password):
    token = consume_link_token(raw, AuthToken.Purpose.RESET_PASSWORD)
    user = token.user
    check_password_strength(new_password, user)
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_all_sessions(user, AuthSession.RevokeReason.PASSWORD_CHANGE)
    log_event(request, AuthEvent.Event.PASSWORD_RESET, True, user)


@transaction.atomic
def change_password(request, user, current_password, new_password, keep_session):
    if user.has_usable_password() and not user.check_password(current_password or ""):
        log_event(request, AuthEvent.Event.PASSWORD_CHANGE, False, user)
        raise ApiError("invalid_credentials", 401)
    check_password_strength(new_password, user)
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_all_sessions(user, AuthSession.RevokeReason.PASSWORD_CHANGE, except_session=keep_session)
    log_event(request, AuthEvent.Event.PASSWORD_CHANGE, True, user)


# ── account deletion ─────────────────────────────────────────────────────

@transaction.atomic
def request_deletion(request, user):
    user.status = User.Status.PENDING_DELETION
    user.deletion_requested_at = timezone.now()
    user.save(update_fields=["status", "deletion_requested_at", "updated_at"])
    # Signs out every device; signing in again during the grace period
    # cancels the deletion (see _cancel_deletion_on_sign_in).
    revoke_all_sessions(user, AuthSession.RevokeReason.ACCOUNT_DELETED)
    purge_on = (user.deletion_requested_at + settings.ACCOUNT_DELETION_GRACE).date().isoformat()
    queue_email(user, EmailOutbox.Template.DELETION_SCHEDULED, _lang(user), {"purge_on": purge_on})
    log_event(request, AuthEvent.Event.DELETION_REQUEST, True, user)
    return purge_on


def _cancel_deletion_on_sign_in(request, user):
    if user.status == User.Status.PENDING_DELETION:
        cancel_deletion(request, user)


@transaction.atomic
def cancel_deletion(request, user):
    user.status = User.Status.ACTIVE
    user.deletion_requested_at = None
    user.save(update_fields=["status", "deletion_requested_at", "updated_at"])
    log_event(request, AuthEvent.Event.DELETION_CANCEL, True, user)


def deletion_due_before():
    return timezone.now() - settings.ACCOUNT_DELETION_GRACE


def stale_cutoff(days):
    return timezone.now() - timedelta(days=days)
