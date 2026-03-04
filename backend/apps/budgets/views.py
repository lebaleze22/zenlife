from datetime import date, timedelta

from django.db.models import Sum
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from common.soft_delete import SoftDeleteModelViewSetMixin
from .models import Budget, BudgetPeriod
from .serializers import BudgetPeriodSerializer, BudgetSerializer, GeneratePeriodsSerializer
from .services import BudgetPeriodComputationService


def _month_end(day: date) -> date:
    next_month = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return next_month - timedelta(days=1)


class BudgetViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BudgetSerializer
    queryset = Budget.objects.all().order_by("-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)
        period_type = self.request.query_params.get("period_type")
        if period_type:
            qs = qs.filter(period_type=period_type)
        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="generate-periods")
    def generate_periods(self, request, pk=None):
        budget = self.get_object()
        payload = GeneratePeriodsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        count = payload.validated_data.get("count", 6)
        cursor = payload.validated_data.get("from_date") or budget.start_date

        created = 0
        for _ in range(count):
            if budget.period_type == Budget.PeriodType.WEEKLY:
                period_start = cursor
                period_end = cursor + timedelta(days=6)
                cursor = period_end + timedelta(days=1)
            else:
                period_start = cursor.replace(day=1)
                period_end = _month_end(period_start)
                cursor = (period_end + timedelta(days=1)).replace(day=1)

            _, was_created = BudgetPeriod.objects.get_or_create(
                budget=budget,
                period_start=period_start,
                defaults={
                    "period_end": period_end,
                    "planned_amount": 0,
                    "recorded_amount": 0,
                    "reserved_amount": 0,
                    "status": BudgetPeriod.PeriodStatus.OPEN,
                },
            )
            if was_created:
                created += 1

        return Response({"created": created, "requested": count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="summary")
    def summary(self, request, pk=None):
        budget = self.get_object()
        periods = budget.periods.filter(deleted_at__isnull=True).order_by("-period_start")

        total_planned = periods.aggregate(v=Sum("planned_amount"))["v"] or 0
        total_recorded = periods.aggregate(v=Sum("recorded_amount"))["v"] or 0
        total_reserved = periods.aggregate(v=Sum("reserved_amount"))["v"] or 0
        total_available = total_planned - total_recorded - total_reserved

        latest = periods.first()
        latest_payload = None
        if latest:
            result = BudgetPeriodComputationService.compute(latest)
            alerts = BudgetPeriodComputationService.evaluate_threshold_alerts(latest, result)
            latest_payload = {
                "id": latest.id,
                "period_start": latest.period_start,
                "period_end": latest.period_end,
                "planned_amount": str(latest.planned_amount),
                "recorded_amount": str(latest.recorded_amount),
                "reserved_amount": str(latest.reserved_amount),
                "computed": {
                    "planned_expense": str(result.planned_expense),
                    "recorded_expense": str(result.recorded_expense),
                    "planned_income": str(result.planned_income),
                    "recorded_income": str(result.recorded_income),
                    "available": str(result.available),
                },
                "alerts": [
                    {
                        "code": alert.code,
                        "threshold_percent": alert.threshold_percent,
                        "usage_percent": str(alert.usage_percent),
                        "level": alert.level,
                        "message": alert.message,
                    }
                    for alert in alerts
                ],
            }

        return Response(
            {
                "budget_id": budget.id,
                "period_count": periods.count(),
                "totals": {
                    "planned": str(total_planned),
                    "recorded": str(total_recorded),
                    "reserved": str(total_reserved),
                    "available": str(total_available),
                },
                "latest_period": latest_payload,
            },
            status=status.HTTP_200_OK,
        )


class BudgetPeriodViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BudgetPeriodSerializer
    queryset = BudgetPeriod.objects.select_related("budget").all().order_by("-period_start")

    def get_queryset(self):
        qs = self.queryset.filter(budget__user=self.request.user, budget__deleted_at__isnull=True)

        budget_id = self.request.query_params.get("budget_id")
        from_date = self.request.query_params.get("from")
        to_date = self.request.query_params.get("to")
        status_filter = self.request.query_params.get("status")

        if budget_id:
            qs = qs.filter(budget_id=budget_id)
        if from_date:
            qs = qs.filter(period_start__gte=from_date)
        if to_date:
            qs = qs.filter(period_end__lte=to_date)
        if status_filter:
            qs = qs.filter(status=status_filter)

        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(budget__user=self.request.user, budget__deleted_at__isnull=True)

    @action(detail=True, methods=["post"], url_path="compute")
    def compute(self, request, pk=None):
        period = self.get_object()
        result = BudgetPeriodComputationService.apply_to_period(period)
        alerts = BudgetPeriodComputationService.evaluate_threshold_alerts(period, result)
        return Response(
            {
                "period_id": period.id,
                "period_start": period.period_start,
                "period_end": period.period_end,
                "planned_amount": str(period.planned_amount),
                "recorded_amount": str(period.recorded_amount),
                "reserved_amount": str(period.reserved_amount),
                "computed": {
                    "planned_expense": str(result.planned_expense),
                    "recorded_expense": str(result.recorded_expense),
                    "planned_income": str(result.planned_income),
                    "recorded_income": str(result.recorded_income),
                    "available": str(result.available),
                },
                "alerts": [
                    {
                        "code": alert.code,
                        "threshold_percent": alert.threshold_percent,
                        "usage_percent": str(alert.usage_percent),
                        "level": alert.level,
                        "message": alert.message,
                    }
                    for alert in alerts
                ],
            },
            status=status.HTTP_200_OK,
        )
