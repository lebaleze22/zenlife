from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Account, Category
from apps.budgets.models import Budget, BudgetPeriod
from apps.goals.models import Goal
from apps.ledger.models import LedgerEntry
from apps.planning.models import ToBuyItem, TodoItem
from apps.projects.models import Project


class PortabilityApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="portable_user",
            email="portable_user@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

        self.account = Account.objects.create(
            user=self.user,
            name="Portable Cash",
            type=Account.AccountType.CASH,
            currency="XAF",
            opening_balance=0,
            current_balance=Decimal("10000.00"),
        )
        self.category = Category.objects.create(
            user=self.user,
            name="Food",
            type=Category.CategoryType.EXPENSE,
        )
        self.goal = Goal.objects.create(
            user=self.user,
            title="Emergency Fund",
            target_amount=Decimal("50000.00"),
            saved_amount=Decimal("10000.00"),
        )
        self.project = Project.objects.create(
            user=self.user,
            name="Apartment",
            sections=[{"id": "s1", "name": "Kitchen", "checklist": []}],
        )
        self.todo = TodoItem.objects.create(
            user=self.user,
            project=self.project,
            title="Paint walls",
        )
        self.tobuy = ToBuyItem.objects.create(
            user=self.user,
            project=self.project,
            name="Fridge",
            quantity=1,
            estimated_cost=Decimal("150000.00"),
            status=ToBuyItem.Status.PLANNED,
        )
        self.budget = Budget.objects.create(
            user=self.user,
            name="Main Budget",
            period_type=Budget.PeriodType.MONTHLY,
            currency="XAF",
            start_date="2026-03-01",
            is_active=True,
        )
        self.period = BudgetPeriod.objects.create(
            budget=self.budget,
            period_start="2026-03-01",
            period_end="2026-03-31",
            planned_amount=Decimal("300000.00"),
            recorded_amount=Decimal("0"),
            reserved_amount=Decimal("0"),
        )
        LedgerEntry.objects.create(
            user=self.user,
            account=self.account,
            category=self.category,
            type=LedgerEntry.EntryType.EXPENSE,
            status=LedgerEntry.EntryStatus.RECORDED,
            amount=Decimal("12000.00"),
            currency="XAF",
            entry_date="2026-03-12",
            note="Portable entry",
        )

    def test_export_then_restore_round_trip(self):
        export_response = self.client.get("/api/v1/exports/data.json")
        self.assertEqual(export_response.status_code, status.HTTP_200_OK)
        payload = export_response.data
        self.assertEqual(payload["schema_version"], "v1")

        # mutate data, then restore from export payload
        Goal.objects.filter(user=self.user).delete()
        Project.objects.filter(user=self.user).delete()
        LedgerEntry.objects.filter(user=self.user).delete()

        restore_response = self.client.post(
            "/api/v1/imports/restore",
            payload,
            format="json",
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)

        self.assertEqual(Account.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Category.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Goal.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Project.objects.filter(user=self.user).count(), 1)
        self.assertEqual(TodoItem.objects.filter(user=self.user).count(), 1)
        self.assertEqual(ToBuyItem.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Budget.objects.filter(user=self.user).count(), 1)
        self.assertEqual(BudgetPeriod.objects.filter(budget__user=self.user).count(), 1)
        self.assertEqual(LedgerEntry.objects.filter(user=self.user).count(), 1)
