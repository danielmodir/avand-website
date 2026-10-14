"""Test settings: one SQLite file per module database, so the routing and
the no-cross-database-foreign-key rules are exercised exactly as on
MySQL. Run with: python manage.py test --settings=config.settings.test"""
import base64
import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-secret-key-not-for-production-use-0123456789")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-not-for-production-use-0123456789")
os.environ.setdefault("PERIOD_KEKS", "1:" + base64.b64encode(b"k" * 32).decode())

from .base import *  # noqa: E402,F401,F403
from .base import BASE_DIR, MODULE_DATABASES  # noqa: E402

DEBUG = False
DATABASES = {
    alias: {"ENGINE": "django.db.backends.sqlite3", "NAME": str(BASE_DIR / f"test_{alias}.sqlite3"), "TEST": {"NAME": None}}
    for alias in MODULE_DATABASES
}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # speed only
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
MEDIA_ROOT = BASE_DIR / "test_media"
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}  # noqa: F405
