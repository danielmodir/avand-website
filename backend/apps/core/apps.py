from django.apps import AppConfig
from django.db.models.signals import post_migrate


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
    verbose_name = "Core (accounts, settings, content)"

    def ready(self):
        from .roles import ensure_roles

        # Roles reference permissions of every app, which exist only after
        # all apps are migrated, so they are (re)applied after each migrate.
        post_migrate.connect(ensure_roles, dispatch_uid="core.ensure_roles")
