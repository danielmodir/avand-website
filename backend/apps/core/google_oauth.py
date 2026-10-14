"""Google sign-in for the web app as a server-side redirect flow, so the
page never loads a Google script:

  1. GET  auth/google/start?next=<app url>   -> 302 to Google (signed state + nonce)
  2. GET  auth/google/callback?code&state    -> verifies, signs in, 302 back to
                                                <app url>#login_code=<one-time code>
  3. POST auth/google/exchange {code}        -> the token pair (code works once, 60 s)

Tokens never appear in a URL. The mobile app instead posts a Google ID
token to auth/google (views.GoogleLoginView).
"""
import secrets
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.http import HttpResponseRedirect
from rest_framework.response import Response

from apps.common.exceptions import ApiError

from .security import sha256_hex
from .services import accounts

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
STATE_SALT = "google-oauth-state"
LOGIN_CODE_TTL = 60


def _allowed_next(url):
    return any(url.startswith(origin + "/") or url == origin for origin in settings.CORS_ALLOWED_ORIGINS) or url.startswith(settings.FRONTEND_URL)


def _configured():
    return bool(settings.GOOGLE_WEB_CLIENT_ID and settings.GOOGLE_WEB_CLIENT_SECRET and settings.GOOGLE_REDIRECT_URI)


def start(request):
    if not _configured():
        raise ApiError("google_sign_in_disabled", 503)
    next_url = request.query_params.get("next") or settings.FRONTEND_URL
    if not _allowed_next(next_url):
        raise ApiError("invalid_redirect")
    nonce = secrets.token_urlsafe(16)
    state = signing.dumps({"next": next_url, "nonce": nonce}, salt=STATE_SALT)
    params = {
        "client_id": settings.GOOGLE_WEB_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
    }
    return HttpResponseRedirect(f"{AUTHORIZE_URL}?{urlencode(params)}")


def claims_from_code(code, nonce):
    """Exchanges the authorization code and verifies the ID token."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    response = requests.post(TOKEN_URL, data={
        "code": code,
        "client_id": settings.GOOGLE_WEB_CLIENT_ID,
        "client_secret": settings.GOOGLE_WEB_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=10)
    if response.status_code != 200:
        raise ApiError("invalid_google_code", 401)
    claims = id_token.verify_oauth2_token(response.json()["id_token"], google_requests.Request(), settings.GOOGLE_WEB_CLIENT_ID)
    if claims.get("nonce") != nonce:
        raise ApiError("invalid_google_code", 401)
    return claims


def callback(request):
    try:
        state = signing.loads(request.query_params.get("state", ""), salt=STATE_SALT, max_age=600)
    except signing.BadSignature:
        raise ApiError("invalid_state")
    next_url = state["next"]
    if request.query_params.get("error") or not request.query_params.get("code"):
        return HttpResponseRedirect(f"{next_url}#login_error=google_cancelled")
    try:
        claims = claims_from_code(request.query_params["code"], state["nonce"])
        user = accounts.google_sign_in(request, claims)
    except ApiError as exc:
        return HttpResponseRedirect(f"{next_url}#login_error={exc.code}")
    tokens = accounts.start_session(user, request, {"platform": "web", "device_name": "Google sign-in"})
    login_code = secrets.token_urlsafe(32)
    cache.set(f"google-login:{sha256_hex(login_code)}", tokens, LOGIN_CODE_TTL)
    return HttpResponseRedirect(f"{next_url}#login_code={login_code}")


def exchange(request):
    code = (request.data or {}).get("code") or ""
    key = f"google-login:{sha256_hex(code)}"
    tokens = cache.get(key)
    if tokens is None:
        raise ApiError("invalid_or_expired_code", 401)
    cache.delete(key)  # single use
    return Response(tokens)
