from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response


class SoftDeleteModelViewSetMixin:
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
