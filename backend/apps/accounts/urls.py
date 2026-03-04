from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AccountViewSet, CategoryViewSet

router = DefaultRouter()
router.register(r"accounts", AccountViewSet, basename="account")
router.register(r"categories", CategoryViewSet, basename="category")

urlpatterns = [
    path("", include(router.urls)),
]
