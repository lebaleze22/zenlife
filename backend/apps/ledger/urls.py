from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LedgerCsvImportView, LedgerEntryViewSet

router = DefaultRouter()
router.register(r"ledger-entries", LedgerEntryViewSet, basename="ledger-entry")

urlpatterns = [
    path("imports/ledger/csv", LedgerCsvImportView.as_view(), name="ledger-csv-import"),
    path("", include(router.urls)),
]
