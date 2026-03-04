# ZenLife Manager - Architecture Design (Frontend, Backend, PostgreSQL)

## 1) Scope and Philosophy
This architecture is for a **planning and management app**, not a payment processor.
The system records planned and manually recorded entries, tracks budgets, projects, To-Buy items, and progress.
No checkout/payment execution is part of MVP.

## 2) High-Level Architecture

```text
[React Web App (PWA-ready)]
   |  HTTPS REST + JWT
   v
[Django + DRF API]
   |  ORM / SQL
   v
[PostgreSQL]
   |
   +--[Object Storage for attachments: S3-compatible (MinIO/S3)]
   +--[Redis: cache + async tasks]

Async:
[Django Q/Celery workers] -> reminders, recurring generation, backup jobs
```

### Runtime boundaries
- Frontend: presentation + local interaction + client validation + offline queue/cache
- Backend: business rules, data integrity, auth, reporting, sync arbitration
- Database: single source of truth

## 3) Frontend Architecture (React + TypeScript + Vite)

## 3.1 Module structure
Recommended structure:

```text
src/
  app/
    router.tsx
    providers/
  modules/
    dashboard/
    ledger/
    budgets/
    projects/
    tobuy/
    todos/
    goals/
    debts/
    investments/
    settings/
  shared/
    ui/
    hooks/
    lib/
    i18n/
    validation/
  data/
    api/
    repositories/
    sync/
    storage/
```

## 3.2 State strategy
- Server state: TanStack Query (queries, cache, retries)
- UI/local ephemeral state: Zustand (or context for small sections)
- Forms: React Hook Form + Zod
- i18n: existing FR/EN dictionary, migrate to namespaced keys

## 3.3 Routing
Use route-based modules:
- `/dashboard`
- `/ledger`
- `/budgets`
- `/projects`
- `/projects/:id`
- `/todo`
- `/goals`
- `/debts`
- `/investments`
- `/settings`

## 3.4 Offline-first behavior
- Local persistence:
  - IndexedDB for cached entities and pending operations
  - localStorage only for preferences (theme/lang)
- Sync queue:
  - queued mutations with idempotency key
  - retry with exponential backoff
  - conflict strategy: server authoritative with field-level timestamps

## 3.5 Frontend domain naming
Use planning vocabulary:
- `Transaction` -> `LedgerEntry`
- statuses: `PLANNED`, `RECORDED`, `CANCELED`
- To-Buy action: `Mark as Recorded` (not "Buy")

## 4) Backend Architecture (Django + DRF)

## 4.1 Project layout

```text
backend/
  config/
    settings/
    urls.py
  apps/
    authn/
    users/
    accounts/
    ledger/
    budgets/
    planning/
    reports/
    notifications/
    attachments/
    audit/
  common/
    errors/
    permissions/
    mixins/
    utils/
```

## 4.2 API style
- REST JSON
- Versioning: `/api/v1`
- Cursor or page-number pagination
- Standard error envelope
- Idempotency-Key header supported for POST/PATCH

## 4.3 Domain service layer
Keep business logic out of serializers/views.
Service examples:
- `ReserveBudgetService`
- `MarkToBuyRecordedService`
- `BudgetComputationService`
- `DebtProjectionService`
- `RecurringExpansionService`

## 4.4 Async jobs
Use Celery (or Django-Q) for:
- recurring entry generation
- reminders (due soon, overdue)
- export generation (PDF/zip)
- backup snapshots

## 4.5 Security model
- JWT access + refresh tokens
- password hashing Argon2
- CORS strict allowlist
- rate limiting on auth endpoints
- audit logs for sensitive operations
- encrypted backup artifacts

## 5) PostgreSQL Database Design

## 5.1 Core principles
- UUID primary keys
- `created_at`, `updated_at` on all mutable tables
- `deleted_at` optional soft-delete for user-facing entities
- strict FK constraints
- selective unique constraints per user

## 5.2 Main entities
- users
- accounts
- categories
- merchants
- tags
- ledger_entries
- ledger_entry_tags (M2M)
- attachments
- budgets
- budget_periods
- recurring_rules
- bills
- goals
- debts
- investment_assets
- projects
- room_sections
- todo_items
- tobuy_items
- planned_spend_reservations
- notification_rules
- audit_logs

## 5.3 Relationship summary
- user 1..n accounts, categories, merchants, tags, budgets, projects
- account 1..n ledger_entries
- category 1..n ledger_entries
- project 1..n room_sections, todo_items, tobuy_items
- tobuy_item 1..n planned_spend_reservations (usually 0..1 active)
- budget 1..n budget_periods
- budget_period 1..n reservations

## 5.4 Key constraints
- `ledger_entries.amount > 0`
- `planned_spend_reservations.reserved_amount >= consumed_amount`
- `tobuy_items.actual_cost >= 0` when set
- unique `(user_id, lower(name))` for categories/tags
- prevent cross-user FK linking (enforced in services + DB constraints where possible)

## 5.5 Indexing strategy
High-priority indexes:
- `ledger_entries(user_id, entry_date DESC)`
- `ledger_entries(user_id, status, entry_date DESC)`
- `ledger_entries(user_id, category_id, entry_date DESC)`
- `tobuy_items(user_id, project_id, status, target_date)`
- `todo_items(user_id, status, due_date)`
- `budget_periods(budget_id, period_start, period_end)`
- `planned_spend_reservations(user_id, budget_period_id, status)`
- GIN for full-text-like search fields if needed (merchant/note/title)

## 5.6 PostgreSQL DDL starter (core tables)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  locale text NOT NULL DEFAULT 'en',
  base_currency text NOT NULL DEFAULT 'XAF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  currency text NOT NULL,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_categories_user_lower_name ON categories(user_id, lower(name));

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  type text NOT NULL,
  status text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  fx_rate numeric(12,6),
  entry_date date NOT NULL,
  note text,
  linked_tobuy_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_user_date ON ledger_entries(user_id, entry_date DESC);
CREATE INDEX idx_ledger_user_status_date ON ledger_entries(user_id, status, entry_date DESC);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tobuy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text,
  priority text NOT NULL DEFAULT 'MEDIUM',
  status text NOT NULL DEFAULT 'IDEA',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  estimated_cost numeric(14,2),
  actual_cost numeric(14,2),
  preferred_store text,
  preferred_link text,
  target_date date,
  notes text,
  warranty_until date,
  payer_split_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actual_cost IS NULL OR actual_cost >= 0)
);
CREATE INDEX idx_tobuy_user_project_status_date ON tobuy_items(user_id, project_id, status, target_date);
```

## 6) Backend API Surface (planning-only)

Core endpoints:
- Auth: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- Ledger: `/ledger-entries` CRUD
- Budgets: `/budgets`, `/budget-periods`
- Projects: `/projects`, `/projects/{id}`
- Todos: `/todos`
- To-Buy: `/to-buy-items`, `/to-buy-items/{id}/reserve`, `/to-buy-items/{id}/mark-recorded`
- Reports: `/reports/cashflow`, `/reports/net-worth`, `/reports/planned-vs-recorded`
- Import/Export: `/imports/ledger/csv`, `/exports/data.json`

## 7) Cross-Cutting Decisions
- Time handling: store UTC in backend, render local timezone in frontend
- Money: numeric decimal in DB, never float
- Currency: store entry currency + optional fx_rate
- Auditability: write audit_logs for reserve/mark-recorded/import/restore
- Idempotency: required for mutation endpoints used by offline queue

## 8) Observability & Operations
- Structured logs JSON with request_id
- Metrics: API latency, error rates, queue depth, sync failures
- Tracing: OpenTelemetry spans for heavy report endpoints
- Alerts: high 5xx, job failures, backup failures

## 9) Migration Plan from Current App
1. Introduce new domain types in frontend (`LedgerEntry`, `ToBuyItem`, `Project`, `Reservation`)
2. Keep existing screens but relabel semantics to planning terms
3. Add backend skeleton + PostgreSQL schema migrations
4. Replace localStorage blobs with repository layer
5. Add sync queue and API integration incrementally (module by module)

## 10) Implementation Milestones
### Milestone A: Foundation
- Backend bootstrap, auth, user/account/category, ledger CRUD
- Frontend repositories + API client + typed DTOs

### Milestone B: Budget + Planning
- budget_periods + reservations
- projects + todos + tobuy
- mark-recorded workflow

### Milestone C: Reports + Stability
- dashboard reports
- import/export
- reminders + recurring generation
- test hardening + performance pass

## 11) Definition of Architecture Done
- All modules have clear ownership and boundaries
- Schema migrated and versioned
- API contracts documented and mocked
- Offline queue strategy implemented
- Security baseline enabled (JWT, hashing, CORS, audit)
- Observability baseline active
