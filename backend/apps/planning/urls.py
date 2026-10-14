from django.urls import path

from . import views

urlpatterns = [
    path("planning/sync", views.SyncView.as_view()),
    path("planning/tasks/<uuid:task_id>/occurrences/<str:day>", views.TaskOccurrenceView.as_view()),
    path("planning/tasks/<uuid:task_id>/attachments/<uuid:file_id>", views.AttachmentView.as_view()),
    path("planning/habits/<uuid:habit_id>/logs/<str:day>", views.HabitLogView.as_view()),
    path("planning/<str:kind>/<uuid:item_id>/exceptions/<str:day>", views.ExceptionView.as_view()),
    path("planning/<str:kind>/<uuid:item_id>", views.ItemView.as_view()),
]
