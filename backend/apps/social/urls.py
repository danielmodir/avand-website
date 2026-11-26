from django.urls import path

from . import groups, task_grants, views

urlpatterns = [
    path("social/task-shares", task_grants.Grants.as_view()),
    path("social/task-shares/<uuid:pk>", task_grants.Detail.as_view()),
    path("social/connections", views.ConnectionListView.as_view()),
    path("social/connections/<uuid:user_id>", views.ConnectionDetailView.as_view()),
    path("social/connections/<uuid:user_id>/request", views.RequestView.as_view()),
    path("social/connections/<uuid:user_id>/respond", views.RespondView.as_view()),
    path("social/blocks/<uuid:user_id>", views.BlockView.as_view()),
    path("social/search", views.SearchView.as_view()),
    path("social/invites", views.InviteListView.as_view()),
    path("social/invites/<uuid:invite_id>", views.InviteDetailView.as_view()),
    path("social/invites/<slug:code>/redeem", views.RedeemInviteView.as_view()),
    path("social/reports", views.ReportView.as_view()),
    path("groups", groups.GroupListView.as_view()),
    path("groups/join", groups.GroupJoinView.as_view()),
    path("groups/<uuid:group_id>", groups.GroupDetailView.as_view()),
    path("groups/<uuid:group_id>/leave", groups.GroupLeaveView.as_view()),
    path("groups/<uuid:group_id>/invite/reset", groups.GroupInviteResetView.as_view()),
    path("groups/<uuid:group_id>/items/<str:item_id>", groups.GroupItemView.as_view()),
    path("groups/<uuid:group_id>/items/<str:item_id>/progress", groups.GroupProgressView.as_view()),
    path("groups/<uuid:group_id>/items/<str:item_id>/marks", groups.GroupMarkView.as_view()),
]
