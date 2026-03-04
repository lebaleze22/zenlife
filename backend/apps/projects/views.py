from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from common.soft_delete import SoftDeleteModelViewSetMixin
from .models import Project
from .serializers import ProjectSerializer


class ProjectViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ProjectSerializer
    queryset = Project.objects.all().order_by("-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)
        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
