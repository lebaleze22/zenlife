from rest_framework import serializers

from .models import ToBuyItem, TodoItem, ToBuyReservation


ALLOWED_STATUS_TRANSITIONS = {
    ToBuyItem.Status.IDEA: {ToBuyItem.Status.RESEARCHING, ToBuyItem.Status.PLANNED, ToBuyItem.Status.RETURNED},
    ToBuyItem.Status.RESEARCHING: {ToBuyItem.Status.PLANNED, ToBuyItem.Status.ORDERED, ToBuyItem.Status.RETURNED},
    ToBuyItem.Status.PLANNED: {ToBuyItem.Status.ORDERED, ToBuyItem.Status.RETURNED},
    ToBuyItem.Status.ORDERED: {ToBuyItem.Status.DELIVERED, ToBuyItem.Status.RETURNED},
    ToBuyItem.Status.DELIVERED: {ToBuyItem.Status.INSTALLED, ToBuyItem.Status.RETURNED},
    ToBuyItem.Status.INSTALLED: {ToBuyItem.Status.RETURNED},
    ToBuyItem.Status.RETURNED: set(),
}


class ToBuyItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToBuyItem
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")

    def validate(self, attrs):
        request = self.context.get("request")
        project = attrs.get("project")
        if project is not None and request is not None and project.user_id != request.user.id:
            raise serializers.ValidationError({"project": "Project does not belong to current user."})

        quantity = attrs.get("quantity")
        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError({"quantity": "Quantity must be > 0."})

        estimated_cost = attrs.get("estimated_cost")
        if estimated_cost is not None and estimated_cost < 0:
            raise serializers.ValidationError({"estimated_cost": "Estimated cost must be >= 0."})

        actual_cost = attrs.get("actual_cost")
        if actual_cost is not None and actual_cost < 0:
            raise serializers.ValidationError({"actual_cost": "Actual cost must be >= 0."})

        if self.instance is not None and "status" in attrs:
            current_status = self.instance.status
            new_status = attrs["status"]
            if new_status != current_status and new_status not in ALLOWED_STATUS_TRANSITIONS.get(current_status, set()):
                raise serializers.ValidationError(
                    {"status": f"Invalid transition from {current_status} to {new_status}."}
                )

        return attrs


class TodoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoItem
        fields = "__all__"
        read_only_fields = ("id", "user", "created_at", "updated_at", "deleted_at")

    def validate(self, attrs):
        request = self.context.get("request")
        project = attrs.get("project")
        if project is not None and request is not None and project.user_id != request.user.id:
            raise serializers.ValidationError({"project": "Project does not belong to current user."})
        return attrs


class ToBuyReservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToBuyReservation
        fields = "__all__"
        read_only_fields = ("id", "user", "status", "released_at", "created_at", "updated_at", "deleted_at")

    def validate(self, attrs):
        request = self.context.get("request")
        if request is None:
            return attrs

        to_buy_item = attrs.get("to_buy_item", getattr(self.instance, "to_buy_item", None))
        budget_period = attrs.get("budget_period", getattr(self.instance, "budget_period", None))
        amount = attrs.get("amount", getattr(self.instance, "amount", None))

        if to_buy_item is not None:
            if to_buy_item.user_id != request.user.id:
                raise serializers.ValidationError({"to_buy_item": "ToBuy item does not belong to current user."})
            if to_buy_item.deleted_at is not None:
                raise serializers.ValidationError({"to_buy_item": "Cannot reserve a deleted ToBuy item."})

        if budget_period is not None:
            if budget_period.budget.user_id != request.user.id:
                raise serializers.ValidationError({"budget_period": "Budget period does not belong to current user."})
            if budget_period.deleted_at is not None or budget_period.budget.deleted_at is not None:
                raise serializers.ValidationError({"budget_period": "Cannot reserve on a deleted budget period."})

        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be > 0."})

        return attrs

