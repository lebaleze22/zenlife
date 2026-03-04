from django.conf import settings
from django.db import models


class ReminderRecord(models.Model):
    class SourceType(models.TextChoices):
        TODO = "TODO", "Todo"
        TOBUY = "TOBUY", "ToBuy"
        BUDGET = "BUDGET", "Budget"

    class Kind(models.TextChoices):
        DUE_SOON = "DUE_SOON", "Due Soon"
        OVERDUE = "OVERDUE", "Overdue"
        BUDGET_80 = "BUDGET_80", "Budget 80%"
        BUDGET_100 = "BUDGET_100", "Budget 100%"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders")
    source_type = models.CharField(max_length=16, choices=SourceType.choices)
    source_id = models.IntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=200)
    message = models.TextField()
    due_date = models.DateField(null=True, blank=True)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "kind", "created_at"], name="idx_reminder_user_kind_ct"),
            models.Index(fields=["source_type", "source_id", "kind"], name="idx_reminder_src_kind"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "source_type", "source_id", "kind", "due_date"],
                name="uq_reminder_user_source_kind_due",
            )
        ]
