"""Planning write paths shared by the views, plus the account purge."""
from django.db import transaction
from django.utils import timezone

from apps.common.api import check_version
from apps.common.exceptions import ApiError

from .models import Category, Event, EventException, Habit, HabitLog, Task, TaskAttachment, TaskException, TaskOccurrence

DB = "planning"
MAX_PHOTOS_PER_TASK = 3


def upsert(model, serializer_class, user_id, item_id, data):
    """PUT semantics: create with the client's id, or update the caller's
    own row if the sent `version` matches (optimistic locking)."""
    with transaction.atomic(using=DB):
        instance = model.objects.select_for_update().filter(pk=item_id).first()
        if instance is not None and instance.user_id != user_id:
            raise ApiError("not_found", 404)
        context = {"user_id": user_id}
        if instance is None:
            serializer = serializer_class(data=data, context=context)
            serializer.is_valid(raise_exception=True)
            obj = serializer.save(id=item_id, user_id=user_id, version=1)
            return serializer_class(obj, context=context).data, True
        check_version(instance, data.get("version"), serializer_class)
        if instance.deleted_at is not None:
            raise ApiError("item_deleted", 410)
        serializer = serializer_class(instance, data=data, partial=True, context=context)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(version=instance.version + 1)
        return serializer_class(obj, context=context).data, False


def soft_delete(model, user_id, item_id):
    with transaction.atomic(using=DB):
        instance = model.objects.select_for_update().filter(pk=item_id, user_id=user_id, deleted_at__isnull=True).first()
        if instance is None:
            raise ApiError("not_found", 404)
        now = timezone.now()
        instance.soft_delete()
        if model is Task:
            # Subtasks go with their parent.
            for child in Task.objects.filter(parent_id=instance.pk, deleted_at__isnull=True):
                child.soft_delete()
        elif model is Category:
            # Items keep existing without the category; bump their versions
            # so other devices pick up the change.
            for item_model in (Task, Habit, Event):
                for item in item_model.objects.filter(category_id=instance.pk):
                    item.category_id = None
                    item.version += 1
                    item.save(update_fields=["category", "version", "updated_at"])
        return now


def owned_or_404(model, user_id, item_id):
    instance = model.objects.filter(pk=item_id, user_id=user_id, deleted_at__isnull=True).first()
    if instance is None:
        raise ApiError("not_found", 404)
    return instance


def set_status(row_model, parent_field, parent, day, status, user_id, allowed, done_value):
    """Upsert one day's status (task occurrence or habit log)."""
    if status not in allowed:
        raise ApiError("invalid_status")
    date_field = "occurrence_date" if row_model is TaskOccurrence else "log_date"
    values = {"status": status}
    if row_model is TaskOccurrence:
        values["completed_at"] = timezone.now() if status == done_value else None
    with transaction.atomic(using=DB):
        row = row_model.objects.select_for_update().filter(**{parent_field: parent, date_field: day}).first()
        if row is None:
            return row_model.objects.create(**{parent_field: parent, date_field: day, "user_id": user_id}, **values)
        for field, value in values.items():
            setattr(row, field, value)
        row.version += 1
        row.save()
        return row

def set_exception(model, parent_field, parent, day, user_id, present):
    """present=True removes `day` from a recurring series; False restores it."""
    if parent.rec_mode == "none":
        raise ApiError("not_recurring")
    with transaction.atomic(using=DB):
        row = model.objects.select_for_update().filter(**{parent_field: parent, "occurrence_date": day}).first()
        if present:
            if row is None:
                model.objects.create(**{parent_field: parent, "occurrence_date": day, "user_id": user_id})
            elif row.deleted_at is not None:
                row.deleted_at = None
                row.save(update_fields=["deleted_at", "updated_at"])
        elif row is not None and row.deleted_at is None:
            row.deleted_at = timezone.now()
            row.save(update_fields=["deleted_at", "updated_at"])


def attach_file(task, file_id, user_id):
    from apps.core.models import StoredFile  # core database, different router target

    if not StoredFile.objects.filter(id=file_id, owner_id=user_id, module_key="planning", deleted_at__isnull=True).exists():
        raise ApiError("file_not_found", 404)
    with transaction.atomic(using=DB):
        live = TaskAttachment.objects.select_for_update().filter(task=task, deleted_at__isnull=True)
        existing = TaskAttachment.objects.filter(task=task, file_id=file_id).first()
        if existing and existing.deleted_at is None:
            return existing
        if live.count() >= MAX_PHOTOS_PER_TASK:
            raise ApiError("task.attachment_limit")
        if existing:
            existing.deleted_at = None
            existing.save(update_fields=["deleted_at", "updated_at"])
            return existing
        return TaskAttachment.objects.create(task=task, file_id=file_id, user_id=user_id, sort_order=live.count())


def purge_user(user_id):
    """Account deletion: everything this user has in toojibee_planning."""
    with transaction.atomic(using=DB):
        for model in (TaskOccurrence, TaskException, TaskAttachment, HabitLog, EventException):
            model.objects.filter(user_id=user_id).delete()
        Task.objects.filter(user_id=user_id, parent__isnull=False).delete()
        for model in (Task, Habit, Event, Category):
            model.objects.filter(user_id=user_id).delete()
