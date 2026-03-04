from django.urls import path

from .views import DataExportView, DataRestoreView

urlpatterns = [
    path("exports/data.json", DataExportView.as_view(), name="export-data-json"),
    path("imports/restore", DataRestoreView.as_view(), name="import-restore"),
]
