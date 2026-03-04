from datetime import timedelta

from django.db import transaction

from apps.budgets.models import BudgetPeriod
from apps.budgets.services import BudgetPeriodComputationService
from apps.planning.models import ToBuyItem, TodoItem

from .models import ReminderRecord


def _create_reminder(user, source_type, source_id, kind, title, message, due_date=None):
    ReminderRecord.objects.get_or_create(
        user=user,
        source_type=source_type,
        source_id=source_id,
        kind=kind,
        due_date=due_date,
        defaults={
            "title": title,
            "message": message,
            "is_resolved": False,
        },
    )


class ReminderGenerationService:
    @staticmethod
    @transaction.atomic
    def run(as_of_date):
        due_soon_limit = as_of_date + timedelta(days=2)

        todos = TodoItem.objects.select_related("user").filter(deleted_at__isnull=True)
        for item in todos:
            if item.status == TodoItem.Status.DONE or item.due_date is None:
                continue
            if item.due_date < as_of_date:
                _create_reminder(
                    item.user,
                    ReminderRecord.SourceType.TODO,
                    item.id,
                    ReminderRecord.Kind.OVERDUE,
                    f"Todo overdue: {item.title}",
                    f'Todo "{item.title}" is overdue since {item.due_date}.',
                    due_date=item.due_date,
                )
            elif item.due_date <= due_soon_limit:
                _create_reminder(
                    item.user,
                    ReminderRecord.SourceType.TODO,
                    item.id,
                    ReminderRecord.Kind.DUE_SOON,
                    f"Todo due soon: {item.title}",
                    f'Todo "{item.title}" is due on {item.due_date}.',
                    due_date=item.due_date,
                )

        tobuy_items = ToBuyItem.objects.select_related("user").filter(deleted_at__isnull=True)
        for item in tobuy_items:
            if item.target_date is None or item.status in (ToBuyItem.Status.DELIVERED, ToBuyItem.Status.INSTALLED, ToBuyItem.Status.RETURNED):
                continue
            if item.target_date < as_of_date:
                _create_reminder(
                    item.user,
                    ReminderRecord.SourceType.TOBUY,
                    item.id,
                    ReminderRecord.Kind.OVERDUE,
                    f"ToBuy overdue: {item.name}",
                    f'ToBuy item "{item.name}" target date passed ({item.target_date}).',
                    due_date=item.target_date,
                )
            elif item.target_date <= due_soon_limit:
                _create_reminder(
                    item.user,
                    ReminderRecord.SourceType.TOBUY,
                    item.id,
                    ReminderRecord.Kind.DUE_SOON,
                    f"ToBuy due soon: {item.name}",
                    f'ToBuy item "{item.name}" target date is {item.target_date}.',
                    due_date=item.target_date,
                )

        periods = BudgetPeriod.objects.select_related("budget", "budget__user").filter(
            deleted_at__isnull=True,
            budget__deleted_at__isnull=True,
            status=BudgetPeriod.PeriodStatus.OPEN,
        )
        for period in periods:
            result = BudgetPeriodComputationService.compute(period)
            alerts = BudgetPeriodComputationService.evaluate_threshold_alerts(period, result)
            for alert in alerts:
                kind = ReminderRecord.Kind.BUDGET_100 if alert.code == "BUDGET_USAGE_100" else ReminderRecord.Kind.BUDGET_80
                _create_reminder(
                    period.budget.user,
                    ReminderRecord.SourceType.BUDGET,
                    period.id,
                    kind,
                    f"Budget alert {alert.threshold_percent}%",
                    alert.message,
                    due_date=period.period_end,
                )
