"""Admin roles as Django groups (kept in sync after every migrate).

Superusers have every permission; these groups are for staff who should
only do part of the job. Assign them in the admin under Users → Groups.
"""
from django.contrib.auth.models import Group, Permission

ROLES = {
    "content_editor": {
        "core": ["appcontent", "legaldocument", "apprelease"],
        "calendar_data": ["occasion", "hijrimonthstart"],
    },
    "moderator": {
        "social": ["report"],
    },
}
# Moderators also need to look up and suspend accounts.
EXTRA_PERMISSIONS = {"moderator": [("core", "view_user"), ("core", "change_user")]}
ACTIONS = ("add", "change", "delete", "view")


def ensure_roles(sender=None, using="default", **kwargs):
    if using != "default":
        return
    for role, apps in ROLES.items():
        group, _ = Group.objects.get_or_create(name=role)
        codenames = [(app, f"{action}_{model}") for app, models in apps.items() for model in models for action in ACTIONS]
        codenames += EXTRA_PERMISSIONS.get(role, [])
        perms = [
            p for app, code in codenames
            for p in Permission.objects.filter(content_type__app_label=app, codename=code)
        ]
        group.permissions.add(*perms)
