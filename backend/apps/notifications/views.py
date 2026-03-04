from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import ReminderRecord
from .serializers import ReminderRecordSerializer


class ReminderRecordViewSet(ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ReminderRecordSerializer
    queryset = ReminderRecord.objects.all().order_by("-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)
        kind = self.request.query_params.get("kind")
        is_resolved = self.request.query_params.get("is_resolved")
        if kind:
            qs = qs.filter(kind=kind)
        if is_resolved in ("true", "false"):
            qs = qs.filter(is_resolved=(is_resolved == "true"))
        return qs
