from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from common.soft_delete import SoftDeleteModelViewSetMixin
from .models import Account, Category
from .serializers import AccountSerializer, CategorySerializer


class UserOwnedQuerySetMixin:
    def get_queryset(self):
        return self.queryset.filter(user=self.request.user, deleted_at__isnull=True)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AccountViewSet(SoftDeleteModelViewSetMixin, UserOwnedQuerySetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AccountSerializer
    queryset = Account.objects.all().order_by("name")


class CategoryViewSet(SoftDeleteModelViewSetMixin, UserOwnedQuerySetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer
    queryset = Category.objects.all().order_by("name")
