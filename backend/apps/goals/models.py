from django.conf import settings
from django.db import models
from decimal import Decimal


class Goal(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not Started"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        ON_HOLD = "ON_HOLD", "On Hold"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="goals")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=120, default="Personal")
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.MEDIUM)
    progress = models.PositiveSmallIntegerField(default=0)
    target_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    saved_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NOT_STARTED)

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status", "deadline"], name="idx_goal_user_stat_deadl"),
        ]

    def clean(self):
        self.target_amount = Decimal(self.target_amount or 0)
        self.saved_amount = Decimal(self.saved_amount or 0)
        if self.progress < 0 or self.progress > 100:
            raise ValueError("progress must be between 0 and 100")
        if self.target_amount < 0:
            raise ValueError("target_amount must be >= 0")
        if self.saved_amount < 0:
            raise ValueError("saved_amount must be >= 0")

    def save(self, *args, **kwargs):
        self.target_amount = Decimal(self.target_amount or 0)
        self.saved_amount = Decimal(self.saved_amount or 0)
        if self.progress < 0 or self.progress > 100:
            raise ValueError("progress must be between 0 and 100")
        if self.target_amount < 0:
            raise ValueError("target_amount must be >= 0")
        if self.saved_amount < 0:
            raise ValueError("saved_amount must be >= 0")
        if self.target_amount > 0:
            computed = int((self.saved_amount / self.target_amount) * 100)
            self.progress = max(0, min(100, computed))
        super().save(*args, **kwargs)
