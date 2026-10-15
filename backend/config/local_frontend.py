"""Local mode only (settings.SERVE_FRONTEND): the API server also serves
the static site from ../frontend, so one address shows everything:

    http://127.0.0.1:8000/          landing page
    http://127.0.0.1:8000/demo/     the app, already connected to this API
    http://127.0.0.1:8000/api/v1/   the API

The demo's js/config.js is replaced on the fly with one pointing at this
same server, so nothing in frontend/ has to be edited (GitHub Pages keeps
serving the real, empty-apiBase config).
"""
from pathlib import Path

from django.conf import settings
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.views.static import serve

FRONTEND_DIR = Path(settings.BASE_DIR).parent / "frontend"

LOCAL_CONFIG = "window.TOOJIBEE_CONFIG = { apiBase: '/api/v1' };\n"


def demo_config(request):
    return HttpResponse(LOCAL_CONFIG, content_type="application/javascript; charset=utf-8")


def frontend(request, path=""):
    target = (FRONTEND_DIR / path).resolve()
    if FRONTEND_DIR.resolve() not in target.parents and target != FRONTEND_DIR.resolve():
        raise Http404  # no ../ escapes
    if target.is_dir():
        if path and not path.endswith("/"):
            return HttpResponseRedirect(f"/{path}/")
        path = f"{path}index.html"
    # Always send the file itself (no 304): a 304 would make the browser
    # reuse whatever headers it cached before, e.g. a wrong Content-Type.
    request.META.pop("HTTP_IF_MODIFIED_SINCE", None)
    response = serve(request, path, document_root=str(FRONTEND_DIR))
    response["Cache-Control"] = "no-cache"
    return response
