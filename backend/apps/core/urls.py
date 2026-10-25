from django.urls import path

from . import views as v

urlpatterns = [
    # auth
    path("auth/providers", v.AuthProvidersView.as_view()),
    path("auth/register", v.RegisterView.as_view()),
    path("auth/login", v.LoginView.as_view()),
    path("auth/google", v.GoogleLoginView.as_view()),  # mobile: posts a Google ID token
    path("auth/google/start", v.GoogleStartView.as_view()),  # web: redirect flow
    path("auth/google/callback", v.GoogleCallbackView.as_view()),
    path("auth/google/exchange", v.GoogleExchangeView.as_view()),
    path("auth/refresh", v.RefreshView.as_view()),
    path("auth/logout", v.LogoutView.as_view()),
    path("auth/logout-all", v.LogoutAllView.as_view()),
    path("auth/sessions", v.SessionListView.as_view()),
    path("auth/sessions/<uuid:session_id>", v.SessionDetailView.as_view()),
    path("auth/email/verify", v.VerifyEmailView.as_view()),
    path("auth/email/code", v.EmailCodeView.as_view()),  # the sign-up code -> signed in
    path("auth/email/code/resend", v.EmailCodeResendView.as_view()),
    path("support/messages", v.SupportMessagesView.as_view()),
    path("support/unread", v.SupportUnreadView.as_view()),
    path("auth/password/code", v.PasswordCodeView.as_view()),
    path("auth/password/forgot", v.PasswordForgotView.as_view()),
    path("auth/password/reset", v.PasswordResetView.as_view()),
    path("auth/password/change", v.PasswordChangeView.as_view()),
    path("auth/account/deletion", v.AccountDeletionView.as_view()),
    # me
    path("me", v.MeView.as_view()),
    path("me/profile", v.ProfileView.as_view()),
    path("me/profile/username-available", v.UsernameAvailableView.as_view()),
    path("me/avatar", v.AvatarView.as_view()),
    path("me/settings", v.SettingsView.as_view()),
    path("me/modules", v.ModuleListView.as_view()),
    path("me/modules/<slug:key>", v.ModuleDetailView.as_view()),
    path("me/modules/<slug:key>/purge", v.ModulePurgeView.as_view()),
    path("me/consents", v.ConsentView.as_view()),
    # files
    path("files", v.FileUploadView.as_view()),
    path("files/<uuid:file_id>", v.FileDetailView.as_view()),
    # public
    path("content/<slug:key>", v.ContentView.as_view()),
    path("legal/<slug:doc_type>", v.LegalDocumentView.as_view()),
    path("releases/<slug:platform>/latest", v.LatestReleaseView.as_view()),
]
