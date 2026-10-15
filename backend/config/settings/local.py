"""Zero-setup local development: no MySQL, no .env needed.

One SQLite file per module database in backend/local_data/ (same routing
and no-cross-database rules as MySQL), console email, fixed development
secrets. Never use these settings on a server: the secrets below are
public. For MySQL locally use config.settings.dev, on a server prod.

    python manage.py migrate_all
    python manage.py runserver 127.0.0.1:8000
"""
import base64
import os

_DEV_ONLY = {
    "DJANGO_SECRET_KEY": "local-dev-only-secret-key-do-not-use-anywhere-else-0123456789abcdef",
    "JWT_SECRET": "local-dev-only-jwt-secret-do-not-use-anywhere-else-0123456789abcdef",
    "PERIOD_KEKS": "1:" + base64.b64encode(b"local-dev-only-period-key-32byte").decode(),
    "CORS_ALLOWED_ORIGINS": "http://localhost:8080,http://127.0.0.1:8080",
    "FRONTEND_URL": "http://localhost:8080/demo/",
}
for _name, _value in _DEV_ONLY.items():
    os.environ.setdefault(_name, _value)

from .base import *  # noqa: E402,F401,F403
from .base import BASE_DIR, MODULE_DATABASES  # noqa: E402

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
LOCAL_DATA = BASE_DIR / "local_data"
LOCAL_DATA.mkdir(exist_ok=True)
DATABASES = {alias: {"ENGINE": "django.db.backends.sqlite3", "NAME": str(LOCAL_DATA / f"{alias}.sqlite3")} for alias in MODULE_DATABASES}
MEDIA_ROOT = LOCAL_DATA / "media"
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
# One address for everything: landing at /, app at /demo/, API at /api/v1/
# (config/local_frontend.py). Never enabled outside this file.
SERVE_FRONTEND = True
CORS_ALLOWED_ORIGINS = CORS_ALLOWED_ORIGINS + ["http://127.0.0.1:8000", "http://localhost:8000"]  # noqa: F405
FRONTEND_URL = "http://127.0.0.1:8000/demo/"
