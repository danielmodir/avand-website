from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    return JsonResponse({"ok": True})


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
