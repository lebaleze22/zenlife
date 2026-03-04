import csv
import io
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from common.soft_delete import SoftDeleteModelViewSetMixin
from apps.accounts.models import Account
from .models import LedgerEntry
from .serializers import LedgerEntrySerializer


class LedgerEntryViewSet(SoftDeleteModelViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = LedgerEntrySerializer
    queryset = LedgerEntry.objects.select_related("account", "category").all().order_by("-entry_date", "-created_at")

    def get_queryset(self):
        qs = self.queryset.filter(user=self.request.user)

        date_from = self.request.query_params.get("from")
        date_to = self.request.query_params.get("to")
        status = self.request.query_params.get("status")
        category_id = self.request.query_params.get("category_id")
        q = self.request.query_params.get("q")

        if date_from:
            qs = qs.filter(entry_date__gte=date_from)
        if date_to:
            qs = qs.filter(entry_date__lte=date_to)
        if status:
            qs = qs.filter(status=status)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if q:
            qs = qs.filter(Q(note__icontains=q))

        return self.apply_deleted_filter(qs)

    def get_restore_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class LedgerCsvImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"error": "Missing file field."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            raw = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return Response({"error": "CSV must be UTF-8 encoded."}, status=status.HTTP_400_BAD_REQUEST)

        reader = csv.DictReader(io.StringIO(raw))
        if not reader.fieldnames:
            return Response({"error": "CSV header is missing."}, status=status.HTTP_400_BAD_REQUEST)

        accounts = Account.objects.filter(user=request.user, deleted_at__isnull=True).order_by("id")
        default_account = accounts.first()
        if not default_account:
            return Response({"error": "No active account found. Create an account first."}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        skipped = 0
        errors = []

        for idx, row in enumerate(reader, start=2):
            try:
                entry_type = (row.get("type") or "").strip().upper()
                if entry_type not in ("INCOME", "EXPENSE", "TRANSFER"):
                    raise ValueError("type must be INCOME/EXPENSE/TRANSFER")

                status_value = (row.get("status") or "PLANNED").strip().upper()
                if status_value not in ("PLANNED", "RECORDED", "CANCELED"):
                    raise ValueError("status must be PLANNED/RECORDED/CANCELED")

                amount_raw = (row.get("amount") or "").strip()
                try:
                    amount = Decimal(amount_raw)
                except (InvalidOperation, TypeError):
                    raise ValueError("amount is invalid")
                if amount <= 0:
                    raise ValueError("amount must be > 0")

                entry_date = (row.get("entry_date") or "").strip()
                if not entry_date:
                    raise ValueError("entry_date is required (YYYY-MM-DD)")

                currency = (row.get("currency") or "XAF").strip().upper() or "XAF"
                note = (row.get("note") or "").strip()

                LedgerEntry.objects.create(
                    user=request.user,
                    account=default_account,
                    type=entry_type,
                    status=status_value,
                    amount=amount,
                    currency=currency,
                    entry_date=entry_date,
                    note=note,
                )
                created += 1
            except Exception as exc:
                skipped += 1
                errors.append({"line": idx, "error": str(exc)})

        return Response(
            {
                "created": created,
                "skipped": skipped,
                "total": created + skipped,
                "errors": errors[:20],
            },
            status=status.HTTP_200_OK,
        )
