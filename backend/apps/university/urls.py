from django.urls import path

from .services import KINDS
from .views import RecordView, StateView

urlpatterns = [
    path("university/state", StateView.as_view()),
    *(path(f"university/{kind}", RecordView.as_view(), {"kind": kind}) for kind in KINDS),
]
