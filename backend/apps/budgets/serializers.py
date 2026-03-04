from datetime import date
from rest_framework import serializers

from .models import Budget, BudgetPeriod


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")


class BudgetPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = BudgetPeriod
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "deleted_at")

    def validate(self, attrs):
        start = attrs.get("period_start", getattr(self.instance, "period_start", None))
        end = attrs.get("period_end", getattr(self.instance, "period_end", None))
        if start and end and end < start:
            raise serializers.ValidationError({"period_end": "period_end must be >= period_start"})

        for field in ("planned_amount", "recorded_amount", "reserved_amount"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: f"{field} must be >= 0"})

        return attrs


class GeneratePeriodsSerializer(serializers.Serializer):
    count = serializers.IntegerField(required=False, min_value=1, max_value=60, default=6)
    from_date = serializers.DateField(required=False)
