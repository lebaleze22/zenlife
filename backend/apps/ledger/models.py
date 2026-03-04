import uuid
from django.conf import settings
from django.db import models


class LedgerEntry(models.Model):
    class EntryType(models.TextChoices):
        INCOME = "INCOME", "Income"
        EXPENSE = "EXPENSE", "Expense"
        TRANSFER = "TRANSFER", "Transfer"

    class EntryStatus(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        RECORDED = "RECORDED", "Recorded"
        CANCELED = "CANCELED", "Canceled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ledger_entries")
    account = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="ledger_entries")
    category = models.ForeignKey("accounts.Category", on_delete=models.SET_NULL, null=True, blank=True, related_name="ledger_entries")

    type = models.CharField(max_length=16, choices=EntryType.choices)
    status = models.CharField(max_length=16, choices=EntryStatus.choices, default=EntryStatus.PLANNED)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="XAF")
    fx_rate = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    entry_date = models.DateField()
    note = models.TextField(blank=True)
    linked_tobuy_id = models.UUIDField(null=True, blank=True, default=None)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "entry_date"], name="idx_ledger_user_date"),
            models.Index(fields=["user", "status", "entry_date"], name="idx_ledger_user_status_date"),
            models.Index(fields=["user", "category", "entry_date"], name="idx_ledger_user_cat_date"),
        ]

    def clean(self):
        if self.amount is not None and self.amount <= 0:
            raise ValueError("amount must be > 0")

    def save(self, *args, **kwargs):
        if self.amount is not None and self.amount <= 0:
            raise ValueError("amount must be > 0")
        super().save(*args, **kwargs)
