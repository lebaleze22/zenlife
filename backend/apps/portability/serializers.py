from rest_framework import serializers


class RestorePayloadSerializer(serializers.Serializer):
    schema_version = serializers.CharField()
    exported_at = serializers.DateTimeField(required=False)
    user = serializers.DictField(required=False)
    data = serializers.DictField()
    clear_existing = serializers.BooleanField(required=False, default=True)

    def validate_schema_version(self, value):
        expected = "v1"
        if value != expected:
            raise serializers.ValidationError(f"Unsupported schema_version '{value}'. Expected '{expected}'.")
        return value
