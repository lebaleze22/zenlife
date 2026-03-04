from rest_framework import serializers
from .models import LedgerEntry


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("amount must be > 0")
        return value

