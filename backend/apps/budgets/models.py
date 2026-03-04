from django.conf import settings
from django.db import models
from django.db.models import Q


class Budget(models.Model):
    class PeriodType(models.TextChoices):
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets")
    name = models.CharField(max_length=160)
    period_type = models.CharField(max_length=16, choices=PeriodType.choices, default=PeriodType.MONTHLY)
    currency = models.CharField(max_length=3, default="XAF")
    start_date = models.DateField()
    is_active = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], condition=Q(deleted_at__isnull=True), name="uq_budget_user_name")
        ]
        indexes = [models.Index(fields=["user", "period_type", "start_date"], name="idx_budget_user_pt_start")]


class BudgetPeriod(models.Model):
    class PeriodStatus(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    budget = models.ForeignKey("budgets.Budget", on_delete=models.CASCADE, related_name="periods")
    period_start = models.DateField()
    period_end = models.DateField()
    planned_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    recorded_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reserved_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=PeriodStatus.choices, default=PeriodStatus.OPEN)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["budget", "period_start"],
                condition=Q(deleted_at__isnull=True),
                name="uq_budget_period_start",
            )
        ]
        indexes = [models.Index(fields=["budget", "period_start", "period_end"], name="idx_budget_period_rng")]
