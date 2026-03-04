from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Sum

from apps.ledger.models import LedgerEntry
from .models import BudgetPeriod


@dataclass
class BudgetPeriodComputationResult:
    planned_expense: Decimal
    recorded_expense: Decimal
    planned_income: Decimal
    recorded_income: Decimal
    available: Decimal


class BudgetPeriodComputationService:
    @staticmethod
    def compute(period: BudgetPeriod) -> BudgetPeriodComputationResult:
        user = period.budget.user
        base = LedgerEntry.objects.filter(
            user=user,
            deleted_at__isnull=True,
            entry_date__gte=period.period_start,
            entry_date__lte=period.period_end,
        )

        planned_expense = base.filter(type=LedgerEntry.EntryType.EXPENSE, status=LedgerEntry.EntryStatus.PLANNED).aggregate(v=Sum("amount"))["v"] or Decimal("0")
        recorded_expense = base.filter(type=LedgerEntry.EntryType.EXPENSE, status=LedgerEntry.EntryStatus.RECORDED).aggregate(v=Sum("amount"))["v"] or Decimal("0")
        planned_income = base.filter(type=LedgerEntry.EntryType.INCOME, status=LedgerEntry.EntryStatus.PLANNED).aggregate(v=Sum("amount"))["v"] or Decimal("0")
        recorded_income = base.filter(type=LedgerEntry.EntryType.INCOME, status=LedgerEntry.EntryStatus.RECORDED).aggregate(v=Sum("amount"))["v"] or Decimal("0")

        # planned_amount acts as the period envelope if set manually; otherwise fallback to planned expense from ledger.
        envelope = period.planned_amount if period.planned_amount > 0 else planned_expense
        available = envelope - recorded_expense - period.reserved_amount

        return BudgetPeriodComputationResult(
            planned_expense=planned_expense,
            recorded_expense=recorded_expense,
            planned_income=planned_income,
            recorded_income=recorded_income,
            available=available,
        )

    @staticmethod
    def apply_to_period(period: BudgetPeriod) -> BudgetPeriodComputationResult:
        result = BudgetPeriodComputationService.compute(period)
        if period.planned_amount <= 0:
            period.planned_amount = result.planned_expense
        period.recorded_amount = result.recorded_expense
        period.save(update_fields=["planned_amount", "recorded_amount", "updated_at"])
        return result
