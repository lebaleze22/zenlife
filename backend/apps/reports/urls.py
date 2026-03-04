from django.urls import path

from .views import CashflowReportView, NetWorthReportView, PlannedVsRecordedReportView


urlpatterns = [
    path("reports/cashflow", CashflowReportView.as_view(), name="report-cashflow"),
    path("reports/net-worth", NetWorthReportView.as_view(), name="report-net-worth"),
    path("reports/planned-vs-recorded", PlannedVsRecordedReportView.as_view(), name="report-planned-vs-recorded"),
]