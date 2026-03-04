from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import RestorePayloadSerializer
from .services import DataPortabilityService


class DataExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        payload = DataPortabilityService.export_user_data(request.user)
        return Response(payload, status=status.HTTP_200_OK)


class DataRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RestorePayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        counts = DataPortabilityService.restore_user_data(
            request.user,
            serializer.validated_data,
            clear_existing=serializer.validated_data.get("clear_existing", True),
        )

        return Response(
            {
                "schema_version": serializer.validated_data["schema_version"],
                "restored": counts,
            },
            status=status.HTTP_200_OK,
        )
