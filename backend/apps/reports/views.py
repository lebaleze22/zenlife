from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import ReportsService, parse_range


class CashflowReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_from, date_to = parse_range(request.query_params.get("from"), request.query_params.get("to"))
        return Response(ReportsService.cashflow(request.user, date_from, date_to))


class NetWorthReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ReportsService.net_worth(request.user))


class PlannedVsRecordedReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_from, date_to = parse_range(request.query_params.get("from"), request.query_params.get("to"))
        return Response(ReportsService.planned_vs_recorded(request.user, date_from, date_to))