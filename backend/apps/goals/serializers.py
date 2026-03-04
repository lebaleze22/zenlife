from rest_framework import serializers

from .models import Goal


class GoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")

    def validate_progress(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("progress must be between 0 and 100")
        return value

    def validate_target_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("target_amount must be >= 0")
        return value

    def validate_saved_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("saved_amount must be >= 0")
        return value
