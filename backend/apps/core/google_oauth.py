"""Server-side Google authorization code flow with browser and app binding."""
import base64
import hashlib
import re
import secrets
from datetime import timedelta
from urllib.parse import urlencode, urlsplit

import requests
from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.http import HttpResponseRedirect
from django.utils import timezone
from google.auth.exceptions import GoogleAuthError
from rest_framework.response import Response

from apps.common.exceptions import ApiError
from .models import AuthToken, User
from .security import sha256_hex
from .services import accounts

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
COOKIE = "tj_google_flow"
STATE_SALT = "google-oauth-state-v2"
FLOW_TTL = 600
LOGIN_CODE_TTL = 60


def _configured():
    return bool(settings.GOOGLE_WEB_CLIENT_ID and settings.GOOGLE_WEB_CLIENT_SECRET and settings.GOOGLE_REDIRECT_URI)


def start(request):
    if not _configured():
        raise ApiError("google_sign_in_disabled", 503)
    if request.query_params.get("next", settings.FRONTEND_URL) != settings.FRONTEND_URL:
        raise ApiError("invalid_redirect")
    challenge = request.query_params.get("challenge", "")
    if not re.fullmatch("[a-f0-9]{64}", challenge):
        raise ApiError("invalid_challenge")
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    pkce = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    params = {
        "client_id": settings.GOOGLE_WEB_CLIENT_ID, "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code", "scope": "openid email profile", "state": state,
        "nonce": nonce, "prompt": "select_account", "code_challenge": pkce, "code_challenge_method": "S256",
    }
    response = HttpResponseRedirect(f"{AUTHORIZE_URL}?{urlencode(params)}")
    response.set_signed_cookie(COOKIE, "|".join([state, nonce, verifier, challenge]), salt=STATE_SALT,
                               max_age=FLOW_TTL, httponly=True, samesite="Lax",
                               path=urlsplit(settings.GOOGLE_REDIRECT_URI).path,
                               secure=settings.GOOGLE_REDIRECT_URI.startswith("https://"))
    response["Cache-Control"] = "no-store"
    return response


def claims_from_code(code, nonce, verifier):
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        response = requests.post(TOKEN_URL, data={
            "code": code, "client_id": settings.GOOGLE_WEB_CLIENT_ID,
            "client_secret": settings.GOOGLE_WEB_CLIENT_SECRET, "code_verifier": verifier,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI, "grant_type": "authorization_code",
        }, timeout=10)
        response.raise_for_status()
        claims = id_token.verify_oauth2_token(response.json()["id_token"], google_requests.Request(), settings.GOOGLE_WEB_CLIENT_ID)
    except (requests.RequestException, GoogleAuthError, KeyError, ValueError) as exc:
        raise ApiError("invalid_google_code", 401) from exc
    if claims.get("nonce") != nonce:
        raise ApiError("invalid_google_code", 401)
    return claims


def callback(request):
    try:
        cookie = request.get_signed_cookie(COOKIE, salt=STATE_SALT, max_age=FLOW_TTL)
        state, nonce, verifier, challenge = cookie.split("|")
    except (KeyError, signing.BadSignature, ValueError):
        raise ApiError("invalid_state")
    if not secrets.compare_digest(state.encode(), request.query_params.get("state", "").encode()):
        raise ApiError("invalid_state")
    result = "login_error=google_cancelled"
    if not request.query_params.get("error") and request.query_params.get("code"):
        try:
            claims = claims_from_code(request.query_params["code"], nonce, verifier)
            user = accounts.google_sign_in(request, claims)
            code = secrets.token_urlsafe(32)
            AuthToken.objects.create(user=user, purpose=AuthToken.Purpose.GOOGLE_LOGIN,
                                     token_hash=sha256_hex(code + ":" + challenge),
                                     expires_at=timezone.now() + timedelta(seconds=LOGIN_CODE_TTL))
            result = f"login_code={code}"
        except ApiError as exc:
            result = f"login_error={exc.code}"
        except IntegrityError:  # competing sign-up for the same address or subject
            result = "login_error=google_retry"
    response = HttpResponseRedirect(f"{settings.FRONTEND_URL}#{result}")
    response.delete_cookie(COOKIE, path=urlsplit(settings.GOOGLE_REDIRECT_URI).path)
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response


@transaction.atomic
def exchange(request):
    code, verifier = request.data.get("code"), request.data.get("verifier")
    if not isinstance(code, str) or not re.fullmatch(r"[\w-]{43}", code, re.ASCII) or not isinstance(verifier, str) or not re.fullmatch("[a-f0-9]{64}", verifier):
        raise ApiError("invalid_or_expired_code", 401)
    now = timezone.now()
    grant = AuthToken.objects.filter(purpose=AuthToken.Purpose.GOOGLE_LOGIN, token_hash=sha256_hex(code + ":" + sha256_hex(verifier)))
    if grant.filter(used_at__isnull=True, expires_at__gt=now).update(used_at=now) != 1:
        raise ApiError("invalid_or_expired_code", 401)
    user = grant.select_related("user").get().user
    if user.status != User.Status.ACTIVE:
        raise ApiError("account_suspended", 403)
    response = Response(accounts.start_session(user, request, request.data))
    response["Cache-Control"] = "no-store"
    return response
