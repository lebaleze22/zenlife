from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Account


class AccountArchiveRestoreApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="accounts_restore_user",
            email="accounts_restore_user@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

        self.account = Account.objects.create(
            user=self.user,
            name="Archive Cash",
            type=Account.AccountType.CASH,
            currency="XAF",
            opening_balance=0,
            current_balance=0,
            is_active=True,
        )

    def test_archived_list_and_restore_account(self):
        delete_response = self.client.delete(f"/api/v1/accounts/{self.account.id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

        active_list = self.client.get("/api/v1/accounts/")
        self.assertEqual(active_list.status_code, status.HTTP_200_OK)
        self.assertEqual(active_list.data["count"], 0)

        archived_list = self.client.get("/api/v1/accounts/?archived=true")
        self.assertEqual(archived_list.status_code, status.HTTP_200_OK)
        self.assertEqual(archived_list.data["count"], 1)

        restore_response = self.client.post(f"/api/v1/accounts/{self.account.id}/restore/")
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)

        active_list_after = self.client.get("/api/v1/accounts/")
        self.assertEqual(active_list_after.status_code, status.HTTP_200_OK)
        self.assertEqual(active_list_after.data["count"], 1)
