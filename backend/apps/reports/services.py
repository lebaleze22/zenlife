from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.accounts.models import Account
from apps.budgets.models import BudgetPeriod
from apps.ledger.models import LedgerEntry


def parse_range(from_raw: str | None, to_raw: str | None) -> tuple[date, date]:
    today = timezone.localdate()
    default_from = today.replace(day=1)
    default_to = today

    if from_raw:
        try:
            default_from = date.fromisoformat(from_raw)
        except ValueError:
            pass
    if to_raw:
        try:
            default_to = date.fromisoformat(to_raw)
        except ValueError:
            pass

    if default_to < default_from:
        default_from, default_to = default_to, default_from

    return default_from, default_to


class ReportsService:
    @staticmethod
    def cashflow(user, date_from: date, date_to: date) -> dict:
        base = LedgerEntry.objects.filter(
            user=user,
            deleted_at__isnull=True,
            entry_date__gte=date_from,
            entry_date__lte=date_to,
        )

        income = base.filter(type=LedgerEntry.EntryType.INCOME).aggregate(v=Sum("amount"))["v"] or Decimal("0")
        expense = base.filter(type=LedgerEntry.EntryType.EXPENSE).aggregate(v=Sum("amount"))["v"] or Decimal("0")

        monthly_rows = (
            base.annotate(month=TruncMonth("entry_date"))
            .values("month", "type")
            .annotate(total=Sum("amount"))
            .order_by("month")
        )

        by_month: dict[str, dict[str, Decimal]] = {}
        for row in monthly_rows:
            month_key = row["month"].strftime("%Y-%m")
            if month_key not in by_month:
                by_month[month_key] = {
                    "income": Decimal("0"),
                    "expense": Decimal("0"),
                }
            if row["type"] == LedgerEntry.EntryType.INCOME:
                by_month[month_key]["income"] = row["total"] or Decimal("0")
            if row["type"] == LedgerEntry.EntryType.EXPENSE:
                by_month[month_key]["expense"] = row["total"] or Decimal("0")

        monthly = []
        for month_key, payload in by_month.items():
            monthly.append(
                {
                    "month": month_key,
                    "income": str(payload["income"]),
                    "expense": str(payload["expense"]),
                    "net": str(payload["income"] - payload["expense"]),
                }
            )

        return {
            "from": str(date_from),
            "to": str(date_to),
            "income": str(income),
            "expense": str(expense),
            "net": str(income - expense),
            "monthly": monthly,
        }

    @staticmethod
    def net_worth(user) -> dict:
        assets = (
            Account.objects.filter(user=user, deleted_at__isnull=True, is_active=True)
            .aggregate(v=Sum("current_balance"))["v"]
            or Decimal("0")
        )

        # Liabilities module is not implemented in MVP yet.
        liabilities = Decimal("0")

        return {
            "assets": str(assets),
            "liabilities": str(liabilities),
            "net_worth": str(assets - liabilities),
        }

    @staticmethod
    def planned_vs_recorded(user, date_from: date, date_to: date) -> dict:
        ledger_base = LedgerEntry.objects.filter(
            user=user,
            deleted_at__isnull=True,
            entry_date__gte=date_from,
            entry_date__lte=date_to,
            type=LedgerEntry.EntryType.EXPENSE,
        )

        planned_ledger = ledger_base.filter(status=LedgerEntry.EntryStatus.PLANNED).aggregate(v=Sum("amount"))["v"] or Decimal("0")
        recorded_ledger = ledger_base.filter(status=LedgerEntry.EntryStatus.RECORDED).aggregate(v=Sum("amount"))["v"] or Decimal("0")

        periods = BudgetPeriod.objects.filter(
            budget__user=user,
            budget__deleted_at__isnull=True,
            deleted_at__isnull=True,
            period_start__lte=date_to,
            period_end__gte=date_from,
        )
        planned_budget = periods.aggregate(v=Sum("planned_amount"))["v"] or Decimal("0")
        recorded_budget = periods.aggregate(v=Sum("recorded_amount"))["v"] or Decimal("0")
        reserved_budget = periods.aggregate(v=Sum("reserved_amount"))["v"] or Decimal("0")

        return {
            "from": str(date_from),
            "to": str(date_to),
            "ledger": {
                "planned_expense": str(planned_ledger),
                "recorded_expense": str(recorded_ledger),
                "variance": str(planned_ledger - recorded_ledger),
            },
            "budget_periods": {
                "planned": str(planned_budget),
                "recorded": str(recorded_budget),
                "reserved": str(reserved_budget),
                "available": str(planned_budget - recorded_budget - reserved_budget),
            },
        }
