from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.services import ReminderGenerationService


class Command(BaseCommand):
    help = "Generate due-soon/overdue and budget-threshold reminders"

    def handle(self, *args, **options):
        ReminderGenerationService.run(timezone.localdate())
        self.stdout.write(self.style.SUCCESS("Reminder generation completed."))
