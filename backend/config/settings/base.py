"""Settings shared by every environment. dev.py / prod.py / test.py extend this."""
import mimetypes
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

# Windows takes file types from the registry, which often maps .js to
# text/plain; browsers then refuse to run the scripts (the admin's and
# the locally served site's). Pin the types instead of trusting the OS.
for _type, _ext in [("text/javascript", ".js"), ("text/css", ".css"), ("image/svg+xml", ".svg"),
                    ("application/json", ".json"), ("font/woff2", ".woff2"), ("image/webp", ".webp"),
                    ("application/manifest+json", ".webmanifest")]:
    mimetypes.add_type(_type, _ext, strict=True)


def env(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"{name} is not set (see backend/.env.example).")
    return value


def env_bool(name, default=False):
    return str(env(name, str(default))).lower() in ("1", "true", "yes", "on")


SECRET_KEY = env("DJANGO_SECRET_KEY", required=True)
DEBUG = False
ALLOWED_HOSTS = [h.strip() for h in env("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.core",
    "apps.calendar_data",
    "apps.planning",
    "apps.period",
    "apps.social",
    "apps.notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.common.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],  # 404/500/403/403_csrf pages (backend/templates)
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ── databases: one MySQL database per module ─────────────────────────────
# Every alias connects with its own least-privilege MySQL user (data only,
# that database only). Running migrations needs DDL rights, so
# `DJANGO_DB_ROLE=migrator` switches every alias to the migrator account.
# See config/routers.py for which app lives in which database.
MODULE_DATABASES = {
    # alias:          (env prefix,        default database name)
    "default":        ("DB_CORE",          "toojibee_core"),
    "calendar":       ("DB_CALENDAR",      "toojibee_calendar"),
    "planning":       ("DB_PLANNING",      "toojibee_planning"),
    "period":         ("DB_PERIOD",        "toojibee_period"),
    "social":         ("DB_SOCIAL",        "toojibee_social"),
    "notifications":  ("DB_NOTIFICATIONS", "toojibee_notifications"),
}


def mysql_databases():
    as_migrator = env("DJANGO_DB_ROLE", "app") == "migrator"
    options = {
        "charset": "utf8mb4",
        "init_command": "SET sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO', time_zone='+00:00'",
    }
    if env_bool("DB_SSL"):
        options["ssl_mode"] = "VERIFY_IDENTITY"
    databases = {}
    for alias, (prefix, default_name) in MODULE_DATABASES.items():
        module = prefix[3:].lower()
        databases[alias] = {
            "ENGINE": "django.db.backends.mysql",
            "HOST": env("DB_HOST", "127.0.0.1"),
            "PORT": env("DB_PORT", "3306"),
            "NAME": env(f"{prefix}_NAME", default_name),
            "USER": env("DB_MIGRATOR_USER", "tj_migrator") if as_migrator else env(f"{prefix}_USER", f"tj_{module}"),
            "PASSWORD": env("DB_MIGRATOR_PASSWORD", required=True) if as_migrator else env(f"{prefix}_PASSWORD", required=True),
            "OPTIONS": dict(options),
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
            "TEST": {"CHARSET": "utf8mb4", "COLLATION": "utf8mb4_0900_ai_ci"},
        }
    return databases


DATABASE_ROUTERS = ["config.routers.ModuleRouter"]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── auth ─────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "core.User"
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Access tokens are short-lived JWTs; refresh tokens are opaque, stored
# only as SHA-256 in core.AuthSession, and rotate on every use.
JWT_SECRET = env("JWT_SECRET", required=True)
ACCESS_TOKEN_LIFETIME = timedelta(minutes=int(env("ACCESS_TOKEN_MINUTES", "15")))
REFRESH_TOKEN_LIFETIME = timedelta(days=int(env("REFRESH_TOKEN_DAYS", "30")))
ACCOUNT_DELETION_GRACE = timedelta(days=30)
EMAIL_TOKEN_LIFETIME = timedelta(hours=24)
PASSWORD_RESET_TOKEN_LIFETIME = timedelta(hours=1)
GOOGLE_CLIENT_IDS = [c.strip() for c in env("GOOGLE_CLIENT_IDS", "").split(",") if c.strip()]  # mobile ID tokens
# Web redirect flow (apps/core/google_oauth.py). The redirect URI is this
# API's /api/v1/auth/google/callback, registered in Google Cloud Console.
GOOGLE_WEB_CLIENT_ID = env("GOOGLE_WEB_CLIENT_ID", "")
GOOGLE_WEB_CLIENT_SECRET = env("GOOGLE_WEB_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = env("GOOGLE_REDIRECT_URI", "")

# Links inside emails point at the web app.
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:8080/demo/")

# ── period encryption (see apps/period/crypto.py) ────────────────────────
# PERIOD_KEKS="1:<base64 32 bytes>,2:<base64 32 bytes>"; the current
# version wraps new user keys, older ones stay to unwrap existing ones.
PERIOD_KEKS = env("PERIOD_KEKS", "")
PERIOD_KEK_CURRENT = int(env("PERIOD_KEK_CURRENT", "1"))

# ── uploads ──────────────────────────────────────────────────────────────
MEDIA_ROOT = Path(env("UPLOAD_DIR", str(BASE_DIR / "media")))
MAX_UPLOAD_BYTES = 3 * 1024 * 1024
MAX_IMAGE_SIDE = 2048
DATA_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024

# ── account deletion: one purge function per module database ────────────
PURGE_HANDLERS = {
    "planning": "apps.planning.services.purge_user",
    "period": "apps.period.services.purge_user",
    "social": "apps.social.services.purge_user",
    "notifications": "apps.notifications.services.purge_user",
}

# ── API ──────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.authentication.AccessTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "600/min",
        "login": "10/min",
        "register": "5/hour",
        "password_reset": "5/hour",
        "refresh": "30/min",
        "search": "30/min",
        "report": "20/day",
        "upload": "60/hour",
    },
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# Reverse proxies in front of the API; client IPs come from X-Forwarded-For
# only when this is set (see apps/core/security.py).
TRUSTED_PROXIES = int(env("TRUSTED_PROXIES", "0"))

CORS_ALLOWED_ORIGINS = [o.strip() for o in env("CORS_ALLOWED_ORIGINS", "http://localhost:8080").split(",") if o.strip()]

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ── email ────────────────────────────────────────────────────────────────
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "localhost")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Toojibee <no-reply@toojibee.ir>")

# ── i18n / time ──────────────────────────────────────────────────────────
LANGUAGE_CODE = "fa"
LANGUAGES = [("fa", "فارسی"), ("en", "English")]
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
ADMIN_URL = env("ADMIN_URL", "admin/")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
