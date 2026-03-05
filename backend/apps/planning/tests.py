from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Account
from apps.budgets.models import Budget, BudgetPeriod
from apps.ledger.models import LedgerEntry
from apps.planning.models import ReservationAuditLog, ToBuyItem, ToBuyReservation


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
        self.assertEqual(ReservationAuditLog.objects.count(), 1)
        self.assertEqual(ReservationAuditLog.objects.first().action, ReservationAuditLog.Action.RESERVED)

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
        self.assertEqual(ReservationAuditLog.objects.count(), 1)
        self.assertEqual(ReservationAuditLog.objects.first().action, ReservationAuditLog.Action.RELEASED)

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
        self.assertEqual(ReservationAuditLog.objects.count(), 1)
        audit = ReservationAuditLog.objects.first()
        self.assertEqual(audit.action, ReservationAuditLog.Action.DELETED)
        self.assertEqual(audit.metadata_json.get("was_active_before_delete"), True)

    def test_mark_recorded_creates_recorded_ledger_entry_and_consumes_active_reservation(self):
        reservation = ToBuyReservation.objects.create(
            user=self.user,
            to_buy_item=self.tobuy,
            budget_period=self.period,
            amount=Decimal("15000.00"),
            status=ToBuyReservation.Status.ACTIVE,
        )
        self.period.reserved_amount = Decimal("20000.00")
        self.period.save(update_fields=["reserved_amount"])

        response = self.client.post(
            f"/api/v1/to-buy-items/{self.tobuy.id}/mark-recorded/",
            {
                "account_id": self.account.id,
                "amount": "14000.00",
                "entry_date": "2026-03-18",
                "note": "Manual recorded purchase",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reservation_consumed"], True)

        self.tobuy.refresh_from_db()
        reservation.refresh_from_db()
        self.period.refresh_from_db()

        self.assertEqual(self.tobuy.actual_cost, Decimal("14000.00"))
        self.assertEqual(self.tobuy.status, ToBuyItem.Status.DELIVERED)
        self.assertEqual(reservation.status, ToBuyReservation.Status.CONSUMED)
        self.assertEqual(self.period.reserved_amount, Decimal("5000.00"))

        entries = LedgerEntry.objects.filter(user=self.user, deleted_at__isnull=True)
        self.assertEqual(entries.count(), 1)
        self.assertEqual(entries.first().status, LedgerEntry.EntryStatus.RECORDED)
        self.assertEqual(entries.first().type, LedgerEntry.EntryType.EXPENSE)
        self.assertEqual(entries.first().amount, Decimal("14000.00"))

        self.assertTrue(
            ReservationAuditLog.objects.filter(
                reservation=reservation,
                action=ReservationAuditLog.Action.CONSUMED,
            ).exists()
        )

    def test_mark_recorded_rejects_duplicate_call_for_same_tobuy_item(self):
        first = self.client.post(
            f"/api/v1/to-buy-items/{self.tobuy.id}/mark-recorded/",
            {
                "account_id": self.account.id,
                "amount": "10000.00",
                "entry_date": "2026-03-12",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            f"/api/v1/to-buy-items/{self.tobuy.id}/mark-recorded/",
            {
                "account_id": self.account.id,
                "amount": "10000.00",
                "entry_date": "2026-03-12",
            },
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(LedgerEntry.objects.filter(user=self.user, deleted_at__isnull=True).count(), 1)


class TimeBlockApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="timeblock_user",
            email="timeblock_user@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_time_block(self):
        response = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Deep Work Session",
                "block_kind": "DEEP_WORK",
                "start_at": "2026-03-05T09:00:00Z",
                "end_at": "2026-03-05T10:30:00Z",
                "notes": "Math revision",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["duration_minutes"], 90)
        self.assertEqual(response.data["title"], "Deep Work Session")
        self.assertEqual(response.data["block_kind"], "DEEP_WORK")
        self.assertEqual(response.data["is_completed"], False)

    def test_create_time_block_defaults_block_kind(self):
        response = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "General Session",
                "start_at": "2026-03-06T09:00:00Z",
                "end_at": "2026-03-06T09:30:00Z",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["block_kind"], "GENERAL")
        self.assertEqual(response.data["is_completed"], False)

    def test_update_time_block_completion_flag(self):
        created = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Checklist",
                "start_at": "2026-03-06T10:00:00Z",
                "end_at": "2026-03-06T11:00:00Z",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        response = self.client.patch(
            f"/api/v1/time-blocks/{created.data['id']}/",
            {"is_completed": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["is_completed"], True)

    def test_create_time_block_rejects_invalid_range(self):
        response = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Invalid Slot",
                "start_at": "2026-03-05T12:00:00Z",
                "end_at": "2026-03-05T11:00:00Z",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_time_blocks_with_range_filter(self):
        self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Morning Focus",
                "start_at": "2026-03-05T07:00:00Z",
                "end_at": "2026-03-05T08:00:00Z",
            },
            format="json",
        )
        self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Evening Focus",
                "start_at": "2026-03-07T19:00:00Z",
                "end_at": "2026-03-07T20:00:00Z",
            },
            format="json",
        )

        response = self.client.get("/api/v1/time-blocks/?from=2026-03-05T00:00:00Z&to=2026-03-05T23:59:59Z")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Morning Focus")

    def test_create_time_block_rejects_overlap(self):
        self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Existing Block",
                "start_at": "2026-03-05T09:00:00Z",
                "end_at": "2026-03-05T10:00:00Z",
            },
            format="json",
        )

        response = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Overlapping Block",
                "start_at": "2026-03-05T09:30:00Z",
                "end_at": "2026-03-05T10:30:00Z",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("start_at", response.data)

    def test_update_time_block_rejects_overlap(self):
        first = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "First Block",
                "start_at": "2026-03-05T08:00:00Z",
                "end_at": "2026-03-05T09:00:00Z",
            },
            format="json",
        )
        second = self.client.post(
            "/api/v1/time-blocks/",
            {
                "title": "Second Block",
                "start_at": "2026-03-05T10:00:00Z",
                "end_at": "2026-03-05T11:00:00Z",
            },
            format="json",
        )

        response = self.client.patch(
            f"/api/v1/time-blocks/{first.data['id']}/",
            {
                "start_at": "2026-03-05T10:30:00Z",
                "end_at": "2026-03-05T11:30:00Z",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("start_at", response.data)
