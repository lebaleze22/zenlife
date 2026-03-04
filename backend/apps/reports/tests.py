from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Account
from apps.budgets.models import Budget, BudgetPeriod
from apps.ledger.models import LedgerEntry


class ReportsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="reports_user",
            email="reports_user@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

        self.account = Account.objects.create(
            user=self.user,
            name="Main Account",
            type=Account.AccountType.CASH,
            currency="XAF",
            opening_balance=Decimal("10000.00"),
            current_balance=Decimal("25000.00"),
        )
        self.budget = Budget.objects.create(
            user=self.user,
            name="Reports Budget",
            period_type=Budget.PeriodType.MONTHLY,
            currency="XAF",
            start_date="2026-03-01",
            is_active=True,
        )
        BudgetPeriod.objects.create(
            budget=self.budget,
            period_start="2026-03-01",
            period_end="2026-03-31",
            planned_amount=Decimal("50000.00"),
            recorded_amount=Decimal("12000.00"),
            reserved_amount=Decimal("5000.00"),
        )

        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.INCOME,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal("100000.00"),
            currency="XAF",
            entry_date="2026-03-02",
        )
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.PLANNED,
            amount=Decimal("30000.00"),
            currency="XAF",
            entry_date="2026-03-03",
        )
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal("12000.00"),
            currency="XAF",
            entry_date="2026-03-05",
        )

    def test_cashflow_report(self):
        response = self.client.get("/api/v1/reports/cashflow?from=2026-03-01&to=2026-03-31")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["income"], "100000.00")
        self.assertEqual(response.data["expense"], "42000.00")
        self.assertEqual(response.data["net"], "58000.00")
        self.assertEqual(len(response.data["monthly"]), 1)

    def test_net_worth_report(self):
        response = self.client.get("/api/v1/reports/net-worth")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["assets"], "25000.00")
        self.assertEqual(response.data["liabilities"], "0")
        self.assertEqual(response.data["net_worth"], "25000.00")

    def test_planned_vs_recorded_report(self):
        response = self.client.get("/api/v1/reports/planned-vs-recorded?from=2026-03-01&to=2026-03-31")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ledger"]["planned_expense"], "30000.00")
        self.assertEqual(response.data["ledger"]["recorded_expense"], "12000.00")
        self.assertEqual(response.data["ledger"]["variance"], "18000.00")
        self.assertEqual(response.data["budget_periods"]["planned"], "50000.00")
        self.assertEqual(response.data["budget_periods"]["recorded"], "12000.00")
