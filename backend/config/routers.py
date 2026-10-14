"""Sends every app to its own database.

Django's own apps (auth, admin, sessions, contenttypes) live with
accounts in the core database. No relation may cross databases: module
tables refer to users by a plain user_id column, never a ForeignKey.
"""

APP_DATABASES = {
    "core": "default",
    "auth": "default",
    "admin": "default",
    "contenttypes": "default",
    "sessions": "default",
    "calendar_data": "calendar",
    "planning": "planning",
    "period": "period",
    "social": "social",
    "notifications": "notifications",
}


def database_for_app(app_label):
    return APP_DATABASES.get(app_label, "default")


class ModuleRouter:
    def db_for_read(self, model, **hints):
        return database_for_app(model._meta.app_label)

    def db_for_write(self, model, **hints):
        return database_for_app(model._meta.app_label)

    def allow_relation(self, obj1, obj2, **hints):
        return database_for_app(obj1._meta.app_label) == database_for_app(obj2._meta.app_label)

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return db == database_for_app(app_label)
