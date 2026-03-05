from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q


class ToBuyItem(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        IDEA = "IDEA", "Idea"
        RESEARCHING = "RESEARCHING", "Researching"
        PLANNED = "PLANNED", "Planned"
        ORDERED = "ORDERED", "Ordered"
        DELIVERED = "DELIVERED", "Delivered"
        INSTALLED = "INSTALLED", "Installed"
        RETURNED = "RETURNED", "Returned"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tobuy_items")
    project = models.ForeignKey("projects.Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="tobuy_items")

    name = models.CharField(max_length=200)
    category = models.CharField(max_length=120, blank=True)
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IDEA)
    quantity = models.PositiveIntegerField(default=1)
    estimated_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    preferred_store = models.CharField(max_length=200, blank=True)
    preferred_link = models.URLField(blank=True)
    target_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    warranty_until = models.DateField(null=True, blank=True)
    payer_split_json = models.JSONField(default=dict, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "project", "status", "target_date"], name="idx_tobuy_usr_prj_st_dt"),
        ]

    def clean(self):
        if self.quantity <= 0:
            raise ValueError("quantity must be > 0")
        if self.actual_cost is not None and self.actual_cost < Decimal("0"):
            raise ValueError("actual_cost must be >= 0")
        if self.estimated_cost is not None and self.estimated_cost < Decimal("0"):
            raise ValueError("estimated_cost must be >= 0")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class TodoItem(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not Started"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        DONE = "DONE", "Done"
        BLOCKED = "BLOCKED", "Blocked"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="todo_items")
    project = models.ForeignKey("projects.Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="todo_items")

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NOT_STARTED)
    due_date = models.DateField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status", "due_date"], name="idx_todo_user_status_due"),
        ]


class ToBuyReservation(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        RELEASED = "RELEASED", "Released"
        CONSUMED = "CONSUMED", "Consumed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tobuy_reservations")
    to_buy_item = models.ForeignKey("planning.ToBuyItem", on_delete=models.PROTECT, related_name="reservations")
    budget_period = models.ForeignKey("budgets.BudgetPeriod", on_delete=models.PROTECT, related_name="tobuy_reservations")

    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    note = models.TextField(blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["to_buy_item"],
                condition=Q(status="ACTIVE", deleted_at__isnull=True),
                name="uq_tobuy_active_reservation",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status", "created_at"], name="idx_tobuy_res_user_st_ct"),
            models.Index(fields=["budget_period", "status"], name="idx_tobuy_res_period_st"),
        ]

    def clean(self):
        if self.amount is not None and self.amount <= 0:
            raise ValueError("amount must be > 0")
        if self.to_buy_item_id and self.user_id and self.to_buy_item.user_id != self.user_id:
            raise ValueError("to_buy_item must belong to the same user")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class ReservationAuditLog(models.Model):
    class Action(models.TextChoices):
        RESERVED = "RESERVED", "Reserved"
        RELEASED = "RELEASED", "Released"
        DELETED = "DELETED", "Deleted"
        CONSUMED = "CONSUMED", "Consumed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reservation_audit_logs")
    reservation = models.ForeignKey("planning.ToBuyReservation", on_delete=models.PROTECT, related_name="audit_logs")
    to_buy_item = models.ForeignKey("planning.ToBuyItem", on_delete=models.PROTECT, related_name="reservation_audit_logs")
    budget_period = models.ForeignKey("budgets.BudgetPeriod", on_delete=models.PROTECT, related_name="reservation_audit_logs")

    action = models.CharField(max_length=16, choices=Action.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    note = models.TextField(blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "action", "created_at"], name="idx_res_audit_user_ac_ct"),
            models.Index(fields=["reservation", "created_at"], name="idx_res_audit_res_ct"),
        ]


class TimeBlock(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="time_blocks")
    project = models.ForeignKey("projects.Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="time_blocks")
    todo_item = models.ForeignKey("planning.TodoItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="time_blocks")

    title = models.CharField(max_length=200)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "start_at", "end_at"], name="idx_time_block_user_rng"),
            models.Index(fields=["user", "project", "start_at"], name="idx_time_block_user_proj"),
        ]

    def clean(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be greater than start_at")
        if self.project_id and self.user_id and self.project.user_id != self.user_id:
            raise ValueError("project must belong to current user")
        if self.todo_item_id and self.user_id and self.todo_item.user_id != self.user_id:
            raise ValueError("todo_item must belong to current user")

    def save(self, *args, **kwargs):
        self.clean()
        delta = self.end_at - self.start_at
        self.duration_minutes = int(delta.total_seconds() // 60)
        super().save(*args, **kwargs)
