from decimal import Decimal
import uuid

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import Account, Category
from apps.budgets.models import BudgetPeriod
from apps.budgets.services import BudgetPeriodComputationService
from apps.ledger.models import LedgerEntry
from common.soft_delete import SoftDeleteModelViewSetMixin
from .models import ReservationAuditLog, ToBuyItem, TodoItem, ToBuyReservation
from .serializers import MarkRecordedSerializer, ToBuyItemSerializer, TodoItemSerializer, ToBuyReservationSerializer


class ToBuyItemViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ToBuyItemSerializer
    queryset = ToBuyItem.objects.select_related("project").all().order_by("-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)

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

        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="mark-recorded")
    def mark_recorded(self, request, pk=None):
        item = self.get_object()
        payload = MarkRecordedSerializer(data=request.data, context={"request": request})
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        amount = data.get("amount") or item.actual_cost or item.estimated_cost
        if amount is None or amount <= 0:
            raise ValidationError({"amount": "Amount is required when item has no actual/estimated cost."})

        tobuy_ref = uuid.uuid5(uuid.NAMESPACE_URL, f"zenlife:tobuy:{item.id}")

        with transaction.atomic():
            existing = LedgerEntry.objects.select_for_update().filter(
                user=request.user,
                linked_tobuy_id=tobuy_ref,
                deleted_at__isnull=True,
            ).exists()
            if existing:
                raise ValidationError({"detail": "This ToBuy item is already marked as recorded."})

            account = None
            if data.get("account_id"):
                account = Account.objects.get(id=data["account_id"], user=request.user, deleted_at__isnull=True, is_active=True)
            else:
                account = Account.objects.filter(user=request.user, deleted_at__isnull=True, is_active=True).order_by("id").first()
            if account is None:
                raise ValidationError({"account_id": "No active account found. Create an account first."})

            category = None
            if data.get("category_id"):
                category = Category.objects.get(id=data["category_id"], user=request.user, deleted_at__isnull=True)

            entry_date = data.get("entry_date") or timezone.localdate()
            user_note = (data.get("note") or "").strip()
            note = f"[TOBUY:{item.id}] {item.name}".strip()
            if user_note:
                note = f"{note} | {user_note}"

            ledger_entry = LedgerEntry.objects.create(
                user=request.user,
                account=account,
                category=category,
                type=LedgerEntry.EntryType.EXPENSE,
                status=LedgerEntry.EntryStatus.RECORDED,
                amount=amount,
                currency=account.currency or "XAF",
                entry_date=entry_date,
                note=note,
                linked_tobuy_id=tobuy_ref,
            )

            item.actual_cost = amount
            if item.status not in (ToBuyItem.Status.DELIVERED, ToBuyItem.Status.INSTALLED):
                item.status = ToBuyItem.Status.DELIVERED
            item.save(update_fields=["actual_cost", "status", "updated_at"])

            reservation_consumed = False
            reservation = (
                ToBuyReservation.objects.select_for_update()
                .select_related("budget_period", "budget_period__budget")
                .filter(
                    user=request.user,
                    to_buy_item=item,
                    status=ToBuyReservation.Status.ACTIVE,
                    deleted_at__isnull=True,
                )
                .first()
            )
            if reservation:
                period = BudgetPeriod.objects.select_for_update().get(
                    id=reservation.budget_period_id,
                    budget__user=request.user,
                    deleted_at__isnull=True,
                    budget__deleted_at__isnull=True,
                )
                period.reserved_amount = max(Decimal("0"), (period.reserved_amount or Decimal("0")) - reservation.amount)
                period.save(update_fields=["reserved_amount", "updated_at"])

                reservation.status = ToBuyReservation.Status.CONSUMED
                reservation.released_at = timezone.now()
                reservation.save(update_fields=["status", "released_at", "updated_at"])
                reservation_consumed = True

                ReservationAuditLog.objects.create(
                    user=request.user,
                    reservation=reservation,
                    to_buy_item=reservation.to_buy_item,
                    budget_period=reservation.budget_period,
                    action=ReservationAuditLog.Action.CONSUMED,
                    amount=reservation.amount,
                    note=f"Consumed by mark-recorded ledger entry {ledger_entry.id}",
                    metadata_json={"ledger_entry_id": ledger_entry.id},
                )

        return Response(
            {
                "to_buy_item_id": item.id,
                "ledger_entry_id": ledger_entry.id,
                "amount": str(amount),
                "reservation_consumed": reservation_consumed,
            },
            status=status.HTTP_200_OK,
        )


class TodoItemViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TodoItemSerializer
    queryset = TodoItem.objects.select_related("project").all().order_by("due_date", "-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)

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

        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ToBuyReservationViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ToBuyReservationSerializer
    queryset = ToBuyReservation.objects.select_related("to_buy_item", "budget_period", "budget_period__budget").all().order_by(
        "-created_at"
    )

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)

        if not self.archived_requested():
            qs = qs.filter(
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

        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def _ensure_reservation_fits_budget(self, period: BudgetPeriod, amount: Decimal):
        computed = BudgetPeriodComputationService.compute(period)
        available = computed.available
        if amount > available:
            raise ValidationError({"amount": f"Reservation exceeds available amount ({available})."})

    def _log_reservation_audit(
        self,
        *,
        user,
        reservation: ToBuyReservation,
        action: str,
        note: str = "",
        metadata: dict | None = None,
    ):
        ReservationAuditLog.objects.create(
            user=user,
            reservation=reservation,
            to_buy_item=reservation.to_buy_item,
            budget_period=reservation.budget_period,
            action=action,
            amount=reservation.amount,
            note=note,
            metadata_json=metadata or {},
        )

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

            reservation = serializer.save(user=user, status=ToBuyReservation.Status.ACTIVE)
            self._log_reservation_audit(
                user=user,
                reservation=reservation,
                action=ReservationAuditLog.Action.RESERVED,
                note=reservation.note,
            )

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
            self._log_reservation_audit(
                user=request.user,
                reservation=reservation,
                action=ReservationAuditLog.Action.RELEASED,
            )

        payload = self.get_serializer(reservation).data
        return Response(payload, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            reservation = (
                ToBuyReservation.objects.select_for_update()
                .select_related("budget_period", "budget_period__budget")
                .get(id=kwargs["pk"], user=request.user, deleted_at__isnull=True)
            )
            was_active_before_delete = reservation.status == ToBuyReservation.Status.ACTIVE
            if was_active_before_delete:
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
            self._log_reservation_audit(
                user=request.user,
                reservation=reservation,
                action=ReservationAuditLog.Action.DELETED,
                metadata={"was_active_before_delete": was_active_before_delete},
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
