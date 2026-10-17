from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views import defaults


def health(request):
    return JsonResponse({"ok": True})


# Error pages: the API always answers in JSON (same {"error": code} shape
# as every other API error); anything else (admin, unknown pages) gets
# the themed HTML pages in backend/templates. Only used when DEBUG=False.
def _is_api(request):
    return request.path.startswith("/api/")


def handler404(request, exception):
    if _is_api(request):
        return JsonResponse({"error": "not_found"}, status=404)
    return defaults.page_not_found(request, exception)


def handler500(request):
    if _is_api(request):
        return JsonResponse({"error": "server_error"}, status=500)
    return defaults.server_error(request)


def handler403(request, exception):
    if _is_api(request):
        return JsonResponse({"error": "forbidden"}, status=403)
    return defaults.permission_denied(request, exception)


api_v1 = [
    path("", include("apps.core.urls")),
    path("", include("apps.calendar_data.urls")),
    path("", include("apps.planning.urls")),
    path("", include("apps.period.urls")),
    path("", include("apps.social.urls")),
    path("", include("apps.notifications.urls")),
]

urlpatterns = [
    path("health", health),
    path("api/v1/", include(api_v1)),
    path(settings.ADMIN_URL, admin.site.urls),
]

# Local mode: also serve the static site (landing + demo) from ../frontend.
if getattr(settings, "SERVE_FRONTEND", False):
    from . import local_frontend

    urlpatterns += [
        path("demo/js/config.js", local_frontend.demo_config),
        re_path(r"^(?!api/)(?P<path>.*)$", local_frontend.frontend),
    ]
