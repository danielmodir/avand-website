import jwt
from django.utils import timezone
from rest_framework import authentication, exceptions

from .models import AuthSession
from .tokens import decode_access_token


class AccessTokenAuthentication(authentication.BaseAuthentication):
    """`Authorization: Bearer <access token>`.

    request.user is the User, request.auth the live AuthSession.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode()
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            raise exceptions.AuthenticationFailed("invalid_authorization_header")
        try:
            claims = decode_access_token(parts[1])
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed("token_expired")
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed("invalid_token")

        session = (
            AuthSession.objects.select_related("user")
            .filter(id=claims["sid"], user_id=claims["sub"], revoked_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )
        if session is None:
            raise exceptions.AuthenticationFailed("session_revoked")
        if not session.user.can_use_api:
            raise exceptions.AuthenticationFailed(f"account_{session.user.status}")
        return session.user, session

    def authenticate_header(self, request):
        return self.keyword
