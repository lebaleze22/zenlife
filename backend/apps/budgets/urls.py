from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BudgetPeriodViewSet, BudgetViewSet

router = DefaultRouter()
router.register(r"budgets", BudgetViewSet, basename="budget")
router.register(r"budget-periods", BudgetPeriodViewSet, basename="budget-period")

urlpatterns = [
    path("", include(router.urls)),
]
