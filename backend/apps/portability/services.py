from decimal import Decimal

from django.db import transaction
from django.forms.models import model_to_dict
from django.utils import timezone

from apps.accounts.models import Account, Category
from apps.budgets.models import Budget, BudgetPeriod
from apps.goals.models import Goal
from apps.ledger.models import LedgerEntry
from apps.notifications.models import ReminderRecord
from apps.planning.models import ReservationAuditLog, TimeBlock, ToBuyItem, ToBuyReservation, TodoItem
from apps.projects.models import Project

SCHEMA_VERSION = "v1"


def _serialize_queryset(queryset, fields):
    return [model_to_dict(obj, fields=fields) for obj in queryset]


class DataPortabilityService:
    @staticmethod
    def export_user_data(user):
        payload = {
            "schema_version": SCHEMA_VERSION,
            "exported_at": timezone.now().isoformat(),
            "user": {
                "username": user.username,
                "email": user.email,
                "display_name": user.display_name,
                "locale": user.locale,
                "base_currency": user.base_currency,
            },
            "data": {
                "accounts": _serialize_queryset(
                    Account.objects.filter(user=user).order_by("id"),
                    ["id", "name", "type", "currency", "opening_balance", "current_balance", "is_active", "deleted_at"],
                ),
                "categories": _serialize_queryset(
                    Category.objects.filter(user=user).order_by("id"),
                    ["id", "name", "type", "parent", "deleted_at"],
                ),
                "goals": _serialize_queryset(
                    Goal.objects.filter(user=user).order_by("id"),
                    [
                        "id",
                        "title",
                        "description",
                        "category",
                        "priority",
                        "progress",
                        "target_amount",
                        "saved_amount",
                        "deadline",
                        "status",
                        "deleted_at",
                    ],
                ),
                "budgets": _serialize_queryset(
                    Budget.objects.filter(user=user).order_by("id"),
                    ["id", "name", "period_type", "currency", "start_date", "is_active", "deleted_at"],
                ),
                "budget_periods": _serialize_queryset(
                    BudgetPeriod.objects.filter(budget__user=user).order_by("id"),
                    [
                        "id",
                        "budget",
                        "period_start",
                        "period_end",
                        "planned_amount",
                        "recorded_amount",
                        "reserved_amount",
                        "status",
                        "deleted_at",
                    ],
                ),
                "projects": _serialize_queryset(
                    Project.objects.filter(user=user).order_by("id"),
                    ["id", "name", "description", "priority", "status", "deadline", "tasks", "sections", "deleted_at"],
                ),
                "todo_items": _serialize_queryset(
                    TodoItem.objects.filter(user=user).order_by("id"),
                    ["id", "project", "title", "description", "priority", "status", "due_date", "deleted_at"],
                ),
                "time_blocks": _serialize_queryset(
                    TimeBlock.objects.filter(user=user).order_by("id"),
                    ["id", "project", "todo_item", "title", "start_at", "end_at", "duration_minutes", "notes", "deleted_at"],
                ),
                "to_buy_items": _serialize_queryset(
                    ToBuyItem.objects.filter(user=user).order_by("id"),
                    [
                        "id",
                        "project",
                        "name",
                        "category",
                        "priority",
                        "status",
                        "quantity",
                        "estimated_cost",
                        "actual_cost",
                        "preferred_store",
                        "preferred_link",
                        "target_date",
                        "notes",
                        "warranty_until",
                        "payer_split_json",
                        "deleted_at",
                    ],
                ),
                "ledger_entries": _serialize_queryset(
                    LedgerEntry.objects.filter(user=user).order_by("id"),
                    [
                        "id",
                        "account",
                        "category",
                        "type",
                        "status",
                        "amount",
                        "currency",
                        "fx_rate",
                        "entry_date",
                        "note",
                        "linked_tobuy_id",
                        "deleted_at",
                    ],
                ),
                "reservations": _serialize_queryset(
                    ToBuyReservation.objects.filter(user=user).order_by("id"),
                    ["id", "to_buy_item", "budget_period", "amount", "status", "note", "released_at", "deleted_at"],
                ),
                "reservation_audit_logs": _serialize_queryset(
                    ReservationAuditLog.objects.filter(user=user).order_by("id"),
                    ["id", "reservation", "to_buy_item", "budget_period", "action", "amount", "note", "metadata_json", "created_at"],
                ),
                "reminders": _serialize_queryset(
                    ReminderRecord.objects.filter(user=user).order_by("id"),
                    ["id", "source_type", "source_id", "kind", "title", "message", "due_date", "is_resolved", "created_at"],
                ),
            },
        }

        return payload

    @staticmethod
    @transaction.atomic
    def restore_user_data(user, payload, clear_existing=True):
        data = payload.get("data") or {}

        if clear_existing:
            ReminderRecord.objects.filter(user=user).delete()
            ReservationAuditLog.objects.filter(user=user).delete()
            ToBuyReservation.objects.filter(user=user).delete()
            LedgerEntry.objects.filter(user=user).delete()
            TodoItem.objects.filter(user=user).delete()
            ToBuyItem.objects.filter(user=user).delete()
            BudgetPeriod.objects.filter(budget__user=user).delete()
            Budget.objects.filter(user=user).delete()
            Project.objects.filter(user=user).delete()
            Goal.objects.filter(user=user).delete()
            Category.objects.filter(user=user).delete()
            Account.objects.filter(user=user).delete()

        profile = payload.get("user") or {}
        user.display_name = profile.get("display_name", user.display_name)
        user.locale = profile.get("locale", user.locale)
        user.base_currency = profile.get("base_currency", user.base_currency)
        user.save(update_fields=["display_name", "locale", "base_currency"])

        counts = {
            "accounts": 0,
            "categories": 0,
            "goals": 0,
            "budgets": 0,
            "budget_periods": 0,
            "projects": 0,
            "todo_items": 0,
            "time_blocks": 0,
            "to_buy_items": 0,
            "ledger_entries": 0,
            "reservations": 0,
            "reservation_audit_logs": 0,
            "reminders": 0,
        }

        for row in data.get("accounts", []):
            Account.objects.create(
                id=row["id"],
                user=user,
                name=row["name"],
                type=row["type"],
                currency=row.get("currency") or "XAF",
                opening_balance=Decimal(str(row.get("opening_balance") or 0)),
                current_balance=Decimal(str(row.get("current_balance") or 0)),
                is_active=row.get("is_active", True),
                deleted_at=row.get("deleted_at"),
            )
            counts["accounts"] += 1

        for row in data.get("categories", []):
            Category.objects.create(
                id=row["id"],
                user=user,
                name=row["name"],
                type=row["type"],
                parent_id=row.get("parent"),
                deleted_at=row.get("deleted_at"),
            )
            counts["categories"] += 1

        for row in data.get("goals", []):
            Goal.objects.create(
                id=row["id"],
                user=user,
                title=row["title"],
                description=row.get("description") or "",
                category=row.get("category") or "Personal",
                priority=row.get("priority") or Goal.Priority.MEDIUM,
                progress=int(row.get("progress") or 0),
                target_amount=Decimal(str(row.get("target_amount") or 0)),
                saved_amount=Decimal(str(row.get("saved_amount") or 0)),
                deadline=row.get("deadline"),
                status=row.get("status") or Goal.Status.NOT_STARTED,
                deleted_at=row.get("deleted_at"),
            )
            counts["goals"] += 1

        for row in data.get("budgets", []):
            Budget.objects.create(
                id=row["id"],
                user=user,
                name=row["name"],
                period_type=row.get("period_type") or Budget.PeriodType.MONTHLY,
                currency=row.get("currency") or "XAF",
                start_date=row["start_date"],
                is_active=row.get("is_active", True),
                deleted_at=row.get("deleted_at"),
            )
            counts["budgets"] += 1

        for row in data.get("budget_periods", []):
            BudgetPeriod.objects.create(
                id=row["id"],
                budget_id=row["budget"],
                period_start=row["period_start"],
                period_end=row["period_end"],
                planned_amount=Decimal(str(row.get("planned_amount") or 0)),
                recorded_amount=Decimal(str(row.get("recorded_amount") or 0)),
                reserved_amount=Decimal(str(row.get("reserved_amount") or 0)),
                status=row.get("status") or BudgetPeriod.PeriodStatus.OPEN,
                deleted_at=row.get("deleted_at"),
            )
            counts["budget_periods"] += 1

        for row in data.get("projects", []):
            Project.objects.create(
                id=row["id"],
                user=user,
                name=row["name"],
                description=row.get("description") or "",
                priority=row.get("priority") or Project.Priority.MEDIUM,
                status=row.get("status") or Project.Status.NOT_STARTED,
                deadline=row.get("deadline"),
                tasks=row.get("tasks") or [],
                sections=row.get("sections") or [],
                deleted_at=row.get("deleted_at"),
            )
            counts["projects"] += 1

        for row in data.get("todo_items", []):
            TodoItem.objects.create(
                id=row["id"],
                user=user,
                project_id=row.get("project"),
                title=row["title"],
                description=row.get("description") or "",
                priority=row.get("priority") or TodoItem.Priority.MEDIUM,
                status=row.get("status") or TodoItem.Status.NOT_STARTED,
                due_date=row.get("due_date"),
                deleted_at=row.get("deleted_at"),
            )
            counts["todo_items"] += 1

        for row in data.get("time_blocks", []):
            TimeBlock.objects.create(
                id=row["id"],
                user=user,
                project_id=row.get("project"),
                todo_item_id=row.get("todo_item"),
                title=row["title"],
                start_at=row["start_at"],
                end_at=row["end_at"],
                duration_minutes=int(row.get("duration_minutes") or 0),
                notes=row.get("notes") or "",
                deleted_at=row.get("deleted_at"),
            )
            counts["time_blocks"] += 1

        for row in data.get("to_buy_items", []):
            ToBuyItem.objects.create(
                id=row["id"],
                user=user,
                project_id=row.get("project"),
                name=row["name"],
                category=row.get("category") or "",
                priority=row.get("priority") or ToBuyItem.Priority.MEDIUM,
                status=row.get("status") or ToBuyItem.Status.IDEA,
                quantity=int(row.get("quantity") or 1),
                estimated_cost=Decimal(str(row["estimated_cost"])) if row.get("estimated_cost") is not None else None,
                actual_cost=Decimal(str(row["actual_cost"])) if row.get("actual_cost") is not None else None,
                preferred_store=row.get("preferred_store") or "",
                preferred_link=row.get("preferred_link") or "",
                target_date=row.get("target_date"),
                notes=row.get("notes") or "",
                warranty_until=row.get("warranty_until"),
                payer_split_json=row.get("payer_split_json") or {},
                deleted_at=row.get("deleted_at"),
            )
            counts["to_buy_items"] += 1

        for row in data.get("ledger_entries", []):
            LedgerEntry.objects.create(
                id=row["id"],
                user=user,
                account_id=row["account"],
                category_id=row.get("category"),
                type=row["type"],
                status=row.get("status") or LedgerEntry.EntryStatus.PLANNED,
                amount=Decimal(str(row["amount"])),
                currency=row.get("currency") or "XAF",
                fx_rate=Decimal(str(row["fx_rate"])) if row.get("fx_rate") is not None else None,
                entry_date=row["entry_date"],
                note=row.get("note") or "",
                linked_tobuy_id=row.get("linked_tobuy_id"),
                deleted_at=row.get("deleted_at"),
            )
            counts["ledger_entries"] += 1

        for row in data.get("reservations", []):
            ToBuyReservation.objects.create(
                id=row["id"],
                user=user,
                to_buy_item_id=row["to_buy_item"],
                budget_period_id=row["budget_period"],
                amount=Decimal(str(row["amount"])),
                status=row.get("status") or ToBuyReservation.Status.ACTIVE,
                note=row.get("note") or "",
                released_at=row.get("released_at"),
                deleted_at=row.get("deleted_at"),
            )
            counts["reservations"] += 1

        for row in data.get("reservation_audit_logs", []):
            ReservationAuditLog.objects.create(
                id=row["id"],
                user=user,
                reservation_id=row["reservation"],
                to_buy_item_id=row["to_buy_item"],
                budget_period_id=row["budget_period"],
                action=row["action"],
                amount=Decimal(str(row["amount"])),
                note=row.get("note") or "",
                metadata_json=row.get("metadata_json") or {},
                created_at=row.get("created_at") or timezone.now(),
            )
            counts["reservation_audit_logs"] += 1

        for row in data.get("reminders", []):
            ReminderRecord.objects.create(
                id=row["id"],
                user=user,
                source_type=row["source_type"],
                source_id=row["source_id"],
                kind=row["kind"],
                title=row["title"],
                message=row["message"],
                due_date=row.get("due_date"),
                is_resolved=bool(row.get("is_resolved", False)),
                created_at=row.get("created_at") or timezone.now(),
            )
            counts["reminders"] += 1

        return counts
