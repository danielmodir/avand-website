from django.urls import path

from . import views

urlpatterns = [
    path("notifications/push-key", views.PushKeyView.as_view()),
    path("notifications/schedule", views.ScheduleView.as_view()),
    path("notifications/subscriptions", views.SubscriptionListView.as_view()),
    path("notifications/subscriptions/<uuid:sub_id>", views.SubscriptionDetailView.as_view()),
    path("notifications/preferences", views.PreferenceView.as_view()),
    path("notifications/mutes/<slug:module_key>", views.MuteView.as_view()),
]
