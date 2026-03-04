from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ReminderRecordViewSet

router = DefaultRouter()
router.register(r"reminders", ReminderRecordViewSet, basename="reminder")

urlpatterns = [
    path("", include(router.urls)),
]
