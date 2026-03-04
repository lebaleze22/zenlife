from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.budgets.models import BudgetPeriod
from apps.budgets.services import BudgetPeriodComputationService
from common.soft_delete import SoftDeleteModelViewSetMixin
from .models import ToBuyItem, TodoItem, ToBuyReservation
from .serializers import ToBuyItemSerializer, TodoItemSerializer, ToBuyReservationSerializer


class ToBuyItemViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ToBuyItemSerializer
    queryset = ToBuyItem.objects.select_related("project").all().order_by("-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user, deleted_at__isnull=True)

        status = self.request.query_params.get("status")
        project_id = self.request.query_params.get("project_id")
        date_from = self.request.query_params.get("from")
        date_to = self.request.query_params.get("to")
        q = self.request.query_params.get("q")

        if status:
            qs = qs.filter(status=status)
        if project_id:
            qs = qs.filter(project_id=project_id)
        if date_from:
            qs = qs.filter(target_date__gte=date_from)
        if date_to:
            qs = qs.filter(target_date__lte=date_to)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(notes__icontains=q) | Q(category__icontains=q))

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TodoItemViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TodoItemSerializer
    queryset = TodoItem.objects.select_related("project").all().order_by("due_date", "-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user, deleted_at__isnull=True)

        status = self.request.query_params.get("status")
        project_id = self.request.query_params.get("project_id")
        due_from = self.request.query_params.get("from")
        due_to = self.request.query_params.get("to")
        q = self.request.query_params.get("q")

        if status:
            qs = qs.filter(status=status)
        if project_id:
            qs = qs.filter(project_id=project_id)
        if due_from:
            qs = qs.filter(due_date__gte=due_from)
        if due_to:
            qs = qs.filter(due_date__lte=due_to)
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ToBuyReservationViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ToBuyReservationSerializer
    queryset = ToBuyReservation.objects.select_related("to_buy_item", "budget_period", "budget_period__budget").all().order_by(
        "-created_at"
    )

    def get_queryset(self):
        qs = self.queryset.filter(
            user=self.request.user,
            deleted_at__isnull=True,
            to_buy_item__deleted_at__isnull=True,
            budget_period__deleted_at__isnull=True,
            budget_period__budget__deleted_at__isnull=True,
        )

        status_filter = self.request.query_params.get("status")
        to_buy_item_id = self.request.query_params.get("to_buy_item_id")
        budget_period_id = self.request.query_params.get("budget_period_id")

        if status_filter:
            qs = qs.filter(status=status_filter)
        if to_buy_item_id:
            qs = qs.filter(to_buy_item_id=to_buy_item_id)
        if budget_period_id:
            qs = qs.filter(budget_period_id=budget_period_id)

        return qs

    def _ensure_reservation_fits_budget(self, period: BudgetPeriod, amount: Decimal):
        computed = BudgetPeriodComputationService.compute(period)
        available = computed.available
        if amount > available:
            raise ValidationError({"amount": f"Reservation exceeds available amount ({available})."})

    def perform_create(self, serializer):
        user = self.request.user
        amount = serializer.validated_data["amount"]
        to_buy_item_id = serializer.validated_data["to_buy_item"].id
        budget_period_id = serializer.validated_data["budget_period"].id

        with transaction.atomic():
            period = (
                BudgetPeriod.objects.select_for_update()
                .select_related("budget")
                .get(id=budget_period_id, budget__user=user, deleted_at__isnull=True, budget__deleted_at__isnull=True)
            )
            to_buy_item = ToBuyItem.objects.select_for_update().get(id=to_buy_item_id, user=user, deleted_at__isnull=True)

            has_active = ToBuyReservation.objects.filter(
                to_buy_item=to_buy_item,
                status=ToBuyReservation.Status.ACTIVE,
                deleted_at__isnull=True,
            ).exists()
            if has_active:
                raise ValidationError({"to_buy_item": "ToBuy item already has an active reservation."})

            self._ensure_reservation_fits_budget(period, amount)

            period.reserved_amount = (period.reserved_amount or Decimal("0")) + amount
            period.save(update_fields=["reserved_amount", "updated_at"])

            serializer.save(user=user, status=ToBuyReservation.Status.ACTIVE)

    @action(detail=True, methods=["post"], url_path="release")
    def release(self, request, pk=None):
        with transaction.atomic():
            reservation = (
                ToBuyReservation.objects.select_for_update()
                .select_related("budget_period", "budget_period__budget")
                .get(id=pk, user=request.user, deleted_at__isnull=True)
            )

            if reservation.status != ToBuyReservation.Status.ACTIVE:
                raise ValidationError({"status": "Only ACTIVE reservations can be released."})

            period = BudgetPeriod.objects.select_for_update().get(
                id=reservation.budget_period_id,
                budget__user=request.user,
                deleted_at__isnull=True,
                budget__deleted_at__isnull=True,
            )
            period.reserved_amount = max(Decimal("0"), (period.reserved_amount or Decimal("0")) - reservation.amount)
            period.save(update_fields=["reserved_amount", "updated_at"])

            reservation.status = ToBuyReservation.Status.RELEASED
            reservation.released_at = timezone.now()
            reservation.save(update_fields=["status", "released_at", "updated_at"])

        payload = self.get_serializer(reservation).data
        return Response(payload, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            reservation = (
                ToBuyReservation.objects.select_for_update()
                .select_related("budget_period", "budget_period__budget")
                .get(id=kwargs["pk"], user=request.user, deleted_at__isnull=True)
            )
            if reservation.status == ToBuyReservation.Status.ACTIVE:
                period = BudgetPeriod.objects.select_for_update().get(
                    id=reservation.budget_period_id,
                    budget__user=request.user,
                    deleted_at__isnull=True,
                    budget__deleted_at__isnull=True,
                )
                period.reserved_amount = max(Decimal("0"), (period.reserved_amount or Decimal("0")) - reservation.amount)
                period.save(update_fields=["reserved_amount", "updated_at"])

                reservation.status = ToBuyReservation.Status.RELEASED
                reservation.released_at = timezone.now()

            reservation.deleted_at = timezone.now()
            reservation.save(update_fields=["status", "released_at", "deleted_at", "updated_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)
