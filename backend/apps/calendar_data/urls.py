from django.urls import path

from . import views

urlpatterns = [
    path("calendar/occasions", views.OccasionsView.as_view()),
    path("calendar/hijri-months", views.HijriMonthsView.as_view()),
    path("calendar/day", views.DayView.as_view()),
]
