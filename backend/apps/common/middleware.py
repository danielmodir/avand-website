"""Minimal CORS for the API: only origins listed in CORS_ALLOWED_ORIGINS,
bearer-token auth (no cookies), so no credentials header is sent."""
from django.conf import settings
from django.http import HttpResponse

ALLOWED_HEADERS = "Authorization, Content-Type, If-Match"
ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"


class CorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        allowed = origin in settings.CORS_ALLOWED_ORIGINS and request.path.startswith("/api/")
        if allowed and request.method == "OPTIONS" and "Access-Control-Request-Method" in request.headers:
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)
        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
            response["Access-Control-Allow-Methods"] = ALLOWED_METHODS
            response["Access-Control-Max-Age"] = "600"
            response["Vary"] = "Origin"
        return response
