"""Local development against MySQL (see database/README.md)."""
from .base import *  # noqa: F401,F403
from .base import mysql_databases

DEBUG = True
DATABASES = mysql_databases()
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
