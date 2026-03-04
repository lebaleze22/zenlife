from django.conf import settings
from django.db import models
from django.db.models import Q


class Project(models.Model):
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

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NOT_STARTED)
    deadline = models.DateField(null=True, blank=True)
    tasks = models.JSONField(default=list, blank=True)
    sections = models.JSONField(default=list, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                condition=Q(deleted_at__isnull=True),
                name="uq_project_user_name",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status", "deadline"], name="idx_proj_user_stat_deadl"),
        ]

    def __str__(self) -> str:
        return self.name
