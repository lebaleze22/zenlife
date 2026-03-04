from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.common.urls")),
    path("api/v1/auth/", include("apps.authn.urls")),
    path("api/v1/users/", include("apps.users.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.ledger.urls")),
    path("api/v1/", include("apps.projects.urls")),
    path("api/v1/", include("apps.planning.urls")),
    path("api/v1/", include("apps.goals.urls")),
    path("api/v1/", include("apps.budgets.urls")),
]
