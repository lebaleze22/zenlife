from rest_framework import serializers
from .models import Account, Category


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")
