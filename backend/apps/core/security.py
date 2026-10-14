"""Small security primitives shared by the auth code."""
import hashlib
import secrets

from django.conf import settings


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_secret_token() -> str:
    """256 bits, URL-safe. Only its sha256_hex is ever stored."""
    return secrets.token_urlsafe(32)


def email_hash(email: str) -> str:
    return sha256_hex((email or "").strip().lower())


def client_ip(request):
    """REMOTE_ADDR, or the client address from X-Forwarded-For when the
    API sits behind a known number of trusted proxies (TRUSTED_PROXIES)."""
    proxies = int(getattr(settings, "TRUSTED_PROXIES", 0) or 0)
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if proxies and forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if len(parts) >= proxies:
            return parts[-proxies]
    return request.META.get("REMOTE_ADDR") or None


def user_agent(request):
    return (request.META.get("HTTP_USER_AGENT") or "")[:255]
