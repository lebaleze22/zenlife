from rest_framework import serializers

from .models import ReminderRecord


class ReminderRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderRecord
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at")
