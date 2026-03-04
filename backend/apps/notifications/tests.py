from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Account
from apps.budgets.models import Budget, BudgetPeriod
from apps.ledger.models import LedgerEntry
from apps.notifications.models import ReminderRecord
from apps.planning.models import ToBuyItem, TodoItem


class ReminderGenerationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="notif_user",
            email="notif_user@example.com",
            password="StrongPass123!",
        )

        self.account = Account.objects.create(
            user=self.user,
            name="Notif Cash",
            type=Account.AccountType.CASH,
            currency="XAF",
            opening_balance=0,
            current_balance=0,
        )

    def test_run_reminders_creates_due_soon_and_overdue_records(self):
        today = timezone.localdate()
        TodoItem.objects.create(
            user=self.user,
            title="Overdue Todo",
            status=TodoItem.Status.NOT_STARTED,
            due_date=today - timedelta(days=1),
        )
        ToBuyItem.objects.create(
            user=self.user,
            name="Due Soon ToBuy",
            status=ToBuyItem.Status.PLANNED,
            target_date=today + timedelta(days=1),
            quantity=1,
        )

        call_command("run_reminders")

        self.assertTrue(
            ReminderRecord.objects.filter(
                user=self.user,
                source_type=ReminderRecord.SourceType.TODO,
                kind=ReminderRecord.Kind.OVERDUE,
            ).exists()
        )
        self.assertTrue(
            ReminderRecord.objects.filter(
                user=self.user,
                source_type=ReminderRecord.SourceType.TOBUY,
                kind=ReminderRecord.Kind.DUE_SOON,
            ).exists()
        )

    def test_run_reminders_creates_budget_threshold_reminder(self):
        today = timezone.localdate()
        budget = Budget.objects.create(
            user=self.user,
            name="Notif Budget",
            period_type=Budget.PeriodType.MONTHLY,
            currency="XAF",
            start_date=today.replace(day=1),
            is_active=True,
        )
        period = BudgetPeriod.objects.create(
            budget=budget,
            period_start=today.replace(day=1),
            period_end=today,
            planned_amount=Decimal("10000.00"),
            recorded_amount=Decimal("0"),
            reserved_amount=Decimal("0"),
        )

        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal("8500.00"),
            currency="XAF",
            entry_date=today,
        )

        call_command("run_reminders")

        self.assertTrue(
            ReminderRecord.objects.filter(
                user=self.user,
                source_type=ReminderRecord.SourceType.BUDGET,
                source_id=period.id,
                kind=ReminderRecord.Kind.BUDGET_80,
            ).exists()
        )
