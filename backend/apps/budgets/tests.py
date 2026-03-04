from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Account
from apps.budgets.models import Budget, BudgetPeriod
from apps.budgets.services import BudgetPeriodComputationService
from apps.ledger.models import LedgerEntry


class BudgetComputationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='budget_calc_user', password='StrongPass123!')
        self.account = Account.objects.create(
            user=self.user,
            name='Calc Cash',
            type=Account.AccountType.CASH,
            currency='XAF',
            opening_balance=0,
            current_balance=0,
        )
        self.budget = Budget.objects.create(
            user=self.user,
            name='Calc Budget',
            period_type=Budget.PeriodType.MONTHLY,
            currency='XAF',
            start_date='2026-03-01',
            is_active=True,
        )
        self.period = BudgetPeriod.objects.create(
            budget=self.budget,
            period_start='2026-03-01',
            period_end='2026-03-31',
            planned_amount=Decimal('0'),
            recorded_amount=Decimal('0'),
            reserved_amount=Decimal('5000.00'),
        )

    def test_compute_uses_ledger_and_available_formula(self):
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.PLANNED,
            amount=Decimal('40000.00'),
            currency='XAF',
            entry_date='2026-03-10',
        )
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal('12000.00'),
            currency='XAF',
            entry_date='2026-03-15',
        )
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.INCOME,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal('50000.00'),
            currency='XAF',
            entry_date='2026-03-20',
        )

        result = BudgetPeriodComputationService.apply_to_period(self.period)

        self.period.refresh_from_db()
        self.assertEqual(result.planned_expense, Decimal('40000.00'))
        self.assertEqual(result.recorded_expense, Decimal('12000.00'))
        self.assertEqual(result.recorded_income, Decimal('50000.00'))
        self.assertEqual(self.period.planned_amount, Decimal('40000.00'))
        self.assertEqual(self.period.recorded_amount, Decimal('12000.00'))
        self.assertEqual(result.available, Decimal('23000.00'))

    def test_compute_keeps_manual_planned_amount(self):
        self.period.planned_amount = Decimal('90000.00')
        self.period.save(update_fields=['planned_amount'])

        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.PLANNED,
            amount=Decimal('15000.00'),
            currency='XAF',
            entry_date='2026-03-09',
        )
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal('25000.00'),
            currency='XAF',
            entry_date='2026-03-10',
        )

        result = BudgetPeriodComputationService.apply_to_period(self.period)
        self.period.refresh_from_db()

        self.assertEqual(self.period.planned_amount, Decimal('90000.00'))
        self.assertEqual(self.period.recorded_amount, Decimal('25000.00'))
        self.assertEqual(result.available, Decimal('60000.00'))


class BudgetThresholdAlertApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='budget_alert_user', password='StrongPass123!')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user,
            name='Alert Cash',
            type=Account.AccountType.CASH,
            currency='XAF',
            opening_balance=0,
            current_balance=0,
        )
        self.budget = Budget.objects.create(
            user=self.user,
            name='Alert Budget',
            period_type=Budget.PeriodType.MONTHLY,
            currency='XAF',
            start_date='2026-03-01',
            is_active=True,
        )
        self.period = BudgetPeriod.objects.create(
            budget=self.budget,
            period_start='2026-03-01',
            period_end='2026-03-31',
            planned_amount=Decimal('10000.00'),
            recorded_amount=Decimal('0'),
            reserved_amount=Decimal('0'),
        )

    def test_summary_returns_warning_alert_at_80_percent_usage(self):
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal('8000.00'),
            currency='XAF',
            entry_date='2026-03-15',
        )

        response = self.client.get(f"/api/v1/budgets/{self.budget.id}/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        alerts = response.data["latest_period"]["alerts"]
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["code"], "BUDGET_USAGE_80")
        self.assertEqual(alerts[0]["level"], "warning")

    def test_compute_returns_critical_alert_at_or_above_100_percent_usage(self):
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal('12000.00'),
            currency='XAF',
            entry_date='2026-03-20',
        )

        response = self.client.post(f"/api/v1/budget-periods/{self.period.id}/compute/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        alerts = response.data["alerts"]
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["code"], "BUDGET_USAGE_100")
        self.assertEqual(alerts[0]["level"], "critical")
