from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response


class SoftDeleteModelViewSetMixin:
    def archived_requested(self) -> bool:
        value = self.request.query_params.get("archived")
        return value in ("1", "true", "True", "yes", "on")

    def apply_deleted_filter(self, qs):
        if self.archived_requested():
            return qs.filter(deleted_at__isnull=False)
        return qs.filter(deleted_at__isnull=True)

    def get_restore_queryset(self):
        return self.queryset

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        instance = self.get_restore_queryset().filter(pk=pk).first()
        if not instance:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        instance.deleted_at = None
        instance.save(update_fields=["deleted_at", "updated_at"])
        return Response({"id": instance.pk, "restored": True}, status=status.HTTP_200_OK)
