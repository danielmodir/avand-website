"""Access tokens: short-lived HS256 JWTs bound to a session row.

Claims: sub (user id), sid (session id), typ ("access"), iat, exp.
The session is re-checked on every request, so logout and revocation
take effect immediately instead of when the token expires.
"""
from datetime import datetime, timezone as dt_timezone

import jwt
from django.conf import settings

ALGORITHM = "HS256"


def issue_access_token(session) -> str:
    now = datetime.now(dt_timezone.utc)
    payload = {
        "sub": str(session.user_id),
        "sid": str(session.id),
        "typ": "access",
        "iat": now,
        "exp": now + settings.ACCESS_TOKEN_LIFETIME,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.InvalidTokenError (expired, tampered, wrong type)."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM], options={"require": ["sub", "sid", "exp", "typ"]})
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload
