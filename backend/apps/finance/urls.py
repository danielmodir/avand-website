from django.urls import path

from . import views

urlpatterns = [
    path("finance/state", views.FinanceStateView.as_view()),
    path("finance/accounts", views.AccountsView.as_view()),
    path("finance/transactions", views.TransactionsView.as_view()),
]
