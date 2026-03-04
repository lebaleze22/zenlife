from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Account
from apps.budgets.models import Budget, BudgetPeriod
from apps.planning.models import ToBuyItem, ToBuyReservation


class ReservationApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="planning_user",
            email="planning_user@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

        self.account = Account.objects.create(
            user=self.user,
            name="Main Cash",
            type=Account.AccountType.CASH,
            currency="XAF",
            opening_balance=0,
            current_balance=0,
        )
        self.budget = Budget.objects.create(
            user=self.user,
            name="Plan Budget",
            period_type=Budget.PeriodType.MONTHLY,
            currency="XAF",
            start_date="2026-03-01",
            is_active=True,
        )
        self.period = BudgetPeriod.objects.create(
            budget=self.budget,
            period_start="2026-03-01",
            period_end="2026-03-31",
            planned_amount=Decimal("100000.00"),
            recorded_amount=Decimal("10000.00"),
            reserved_amount=Decimal("5000.00"),
        )
        self.tobuy = ToBuyItem.objects.create(
            user=self.user,
            name="Laptop",
            category="Electronics",
            estimated_cost=Decimal("30000.00"),
            quantity=1,
            status=ToBuyItem.Status.PLANNED,
        )

    def test_create_reservation_increments_budget_period_reserved_amount(self):
        response = self.client.post(
            "/api/v1/reservations/",
            {
                "to_buy_item": self.tobuy.id,
                "budget_period": self.period.id,
                "amount": "20000.00",
                "note": "Reserve laptop budget",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.period.refresh_from_db()
        self.assertEqual(self.period.reserved_amount, Decimal("25000.00"))
        self.assertEqual(ToBuyReservation.objects.filter(deleted_at__isnull=True).count(), 1)

    def test_create_reservation_rejects_when_amount_exceeds_available(self):
        response = self.client.post(
            "/api/v1/reservations/",
            {
                "to_buy_item": self.tobuy.id,
                "budget_period": self.period.id,
                "amount": "96000.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.period.refresh_from_db()
        self.assertEqual(self.period.reserved_amount, Decimal("5000.00"))

    def test_release_reservation_decrements_budget_period_reserved_amount(self):
        reservation = ToBuyReservation.objects.create(
            user=self.user,
            to_buy_item=self.tobuy,
            budget_period=self.period,
            amount=Decimal("12000.00"),
            status=ToBuyReservation.Status.ACTIVE,
        )
        self.period.reserved_amount = Decimal("17000.00")
        self.period.save(update_fields=["reserved_amount"])

        response = self.client.post(f"/api/v1/reservations/{reservation.id}/release/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        reservation.refresh_from_db()
        self.period.refresh_from_db()
        self.assertEqual(reservation.status, ToBuyReservation.Status.RELEASED)
        self.assertEqual(self.period.reserved_amount, Decimal("5000.00"))

    def test_delete_active_reservation_soft_deletes_and_releases_amount(self):
        reservation = ToBuyReservation.objects.create(
            user=self.user,
            to_buy_item=self.tobuy,
            budget_period=self.period,
            amount=Decimal("15000.00"),
            status=ToBuyReservation.Status.ACTIVE,
        )
        self.period.reserved_amount = Decimal("20000.00")
        self.period.save(update_fields=["reserved_amount"])

        response = self.client.delete(f"/api/v1/reservations/{reservation.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        reservation.refresh_from_db()
        self.period.refresh_from_db()
        self.assertIsNotNone(reservation.deleted_at)
        self.assertEqual(reservation.status, ToBuyReservation.Status.RELEASED)
        self.assertEqual(self.period.reserved_amount, Decimal("5000.00"))
