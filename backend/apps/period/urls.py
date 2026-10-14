from django.urls import path

from . import views

urlpatterns = [
    path("period/profile", views.ProfileView.as_view()),
    path("period/cycles", views.CycleListView.as_view()),
    path("period/cycles/<uuid:cycle_id>", views.CycleDetailView.as_view()),
    path("period/predictions", views.PredictionsView.as_view()),
]
