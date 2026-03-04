# ZenLife Manager - Stack B Implementation Spec (Planning-Only)

## 1. Executive Summary
ZenLife Manager est une app de planification et pilotage personnel: budget previsionnel, objectifs, projets (Apartment/Kid), TODO et To-Buy. L'app ne sert pas a acheter ni executer des paiements. Elle suit des plans, estimations, avancements et ecarts.

## 2. Core Features
- Financial Planning: comptes virtuels, entrees planifiees (revenus/depenses/transferts), budgets, bills recurrents, objectifs, dettes, net worth previsionnel.
- Life Planning: TODO, To-Buy, projets Apartment/Kid, sections/rooms, checklists.
- Control: planned vs actual (au sens "realise manuellement"), reminders, export/import, offline-first.

## 3. Personas + Journeys
- Couple en installation: planifie achats maison, reserve budget, suit progression par piece.
- Futurs parents: planifie checklist et depenses enfant, suit urgences et deadlines.
- Utilisateur discipline budget: suit cashflow previsionnel et scenarios dette.

## 4. Functional Requirements
FR-001: Creer/editer/supprimer comptes virtuels.
FR-002: Creer des entries budgetaires (PLANNED/RECORDED), sans execution bancaire.
FR-003: Import CSV d'entries planifiees/realisees.
FR-004: Definir budgets (weekly/monthly) et alertes de depassement.
FR-005: Creer rules recurrentes et occurrences planifiees.
FR-006: Gerer objectifs d'epargne et progression.
FR-007: Gerer dettes + projections (snowball/avalanche).
FR-008: Creer To-Buy item complet (statut, cout estime/reel, tags, photos, date cible).
FR-009: Reserver budget depuis To-Buy (planned spend reservation).
FR-010: Convertir To-Buy en "entry RECORDED" (journal interne, pas achat reel).
FR-011: Gerer projets (Apartment/Kid/custom) + sections + todo.
FR-012: Calculer progression projet + cout planifie/reel/restant.
FR-013: Notifications pour due soon / overdue / budget threshold.
FR-014: Export/restore JSON avec validation schema versionnee.

## 5. Non-Functional Requirements
- Privacy-first, offline-first, i18n FR/EN, WCAG AA.
- Performance: dashboard < 2s avec 10k entries.
- Security: chiffrement backup, PIN local, journal d'audit.

## 6. Data Model
### Enums
- EntryType: INCOME, EXPENSE, TRANSFER
- EntryStatus: PLANNED, RECORDED, CANCELED
- Priority: LOW, MEDIUM, HIGH
- ToBuyStatus: IDEA, RESEARCHING, PLANNED, ORDERED, DELIVERED, INSTALLED, RETURNED
- TodoStatus: NOT_STARTED, IN_PROGRESS, DONE, BLOCKED
- BudgetPeriodType: WEEKLY, MONTHLY
- DebtStrategy: SNOWBALL, AVALANCHE

### Entities
- User, Account, Category, Merchant, Tag
- LedgerEntry (remplace Transaction)
- Attachment
- Budget, BudgetPeriod
- RecurringRule, Bill
- Goal, Debt, InvestmentAsset
- Project, RoomSection, TodoItem, ToBuyItem
- PlannedSpendReservation
- NotificationRule
- AuditLog

### Key Rules
- FK strict sur user-owned entities.
- Index: LedgerEntry(user_id,date), ToBuyItem(project_id,status,target_date), BudgetPeriod(budget_id,period_start).
- Integrity: reservation <= budget available.

## 7. Business Rules & Calculations
- Cashflow previsionnel = somme INCOME - somme EXPENSE (entries filtrees par statut/periode).
- Budget available = planned - recorded - reserved.
- Conversion To-Buy -> LedgerEntry RECORDED:
  - cree une entry EXPENSE RECORDED
  - renseigne linked_tobuy_id
  - met a jour actual_cost du To-Buy
  - consomme reservation associee.
- Net worth previsionnel = actifs planifies - passifs (dettes).

## 8. API Specification (REST)
Base: `/api/v1`

### Auth (si backend active)
- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/refresh`
- POST `/auth/logout`

### Planning Finance
- GET/POST `/accounts`
- GET/POST `/ledger-entries`
- GET `/ledger-entries?from=&to=&status=&category_id=&q=&page=&page_size=`
- GET/POST `/budgets`
- GET `/reports/cashflow`
- GET `/reports/net-worth`
- GET `/reports/planned-vs-recorded`

### Projects / To-Buy / Todo
- GET/POST `/projects`
- GET/POST `/todos`
- GET/POST `/to-buy-items`
- POST `/to-buy-items/{id}/reserve`
- POST `/to-buy-items/{id}/mark-recorded`

### Import/Export
- POST `/imports/ledger/csv`
- GET `/exports/data.json`
- GET `/exports/summary.pdf`

### Error Model
```json
{"error":{"code":"VALIDATION_ERROR","message":"reserved exceeds available","details":[{"field":"reserved_amount","issue":"too_high"}]}}
```

## 9. UI/UX Spec
- Onboarding: langue/devise/PIN.
- Dashboard: cashflow previsionnel, budgets, reminders, projets.
- Ledger: liste + add/edit + filtres + piece jointe.
- Budget: planned/recorded/reserved.
- Projects: Apartment/Kid cards.
- Project detail: sections, todos, to-buy, ecarts budget.
- Settings: backup/export/import/security/categories.

## 10. Analytics & Insights
- KPIs: savings rate, burn rate, budget variance, project planned-vs-recorded, debt ETA.
- Forecasting: projection 30/90 jours (scenario mode).

## 11. Notifications
- Budget 80%/100%
- Bill due soon
- To-Buy due soon / overdue
- Todo overdue

## 12. Roles & Permissions
- MVP: Owner unique.
- Future: Admin/Editor/Viewer.

## 13. Integrations
- MVP: CSV import/export, PDF summaries.
- V1: calendar reminders, email receipt parsing.
- No purchase/payment integration in scope.

## 14. Security Model
- JWT (si backend), PIN local, backups AES-GCM, audit logs.

## 15. Backup & Restore
- Full JSON export versionne.
- Restore avec validation + dry-run.

## 16. Testing Strategy
- Unit: calculs budget/reservation/projections.
- Integration: reserve + mark-recorded.
- E2E: onboarding -> budget -> reserve -> mark-recorded.

## 17. Deployment Architecture
- Stack B: React + Django/DRF + PostgreSQL.
- Environnements: dev/staging/prod.
- CI/CD: lint + test + migration check.

## 18. Roadmap
- MVP: ledger planning, budgets, to-buy/projects/todo, reminders, export/import.
- V1: debt/goal/investment enrichi, reporting avance.
- V2: collaboration partagee, insights predicts.

## 19. Risks & Mitigations
- Confusion "real purchase": wording UI explicite "Recorded (manual)".
- Data drift offline: idempotency keys + sync queue.
- Calculation regressions: tests unitaires obligatoires.

## 20. Glossary
- Planned: prevision
- Recorded: realise manuellement dans l'app (pas transaction bancaire)
- Reserved: budget bloque pour achat prevu
- Variance: ecart planifie vs enregistre

---

## MVP Scope Checklist
- [ ] Ledger entries PLANNED/RECORDED
- [ ] Budgets + planned/recorded/reserved
- [ ] Projects + sections + todos + to-buy
- [ ] To-Buy reserve + mark-recorded
- [ ] Dashboard KPIs
- [ ] Export/import + PIN local

## Definition of Done
- [ ] AC valides
- [ ] Tests green
- [ ] No P1/P2
- [ ] API/docs/migrations a jour

## Sample Dataset (JSON)
```json
{
  "ledger_entries": [
    {"id":"le1","type":"INCOME","status":"PLANNED","amount":1200000,"currency":"XAF","date":"2026-03-01","category":"Salary"},
    {"id":"le2","type":"EXPENSE","status":"RECORDED","amount":85000,"currency":"XAF","date":"2026-03-02","category":"Groceries"},
    {"id":"le3","type":"EXPENSE","status":"RECORDED","amount":250000,"currency":"XAF","date":"2026-03-03","category":"Furniture","linked_tobuy_id":"tb2"},
    {"id":"le4","type":"EXPENSE","status":"PLANNED","amount":42000,"currency":"XAF","date":"2026-03-04","category":"Transport"},
    {"id":"le5","type":"TRANSFER","status":"PLANNED","amount":100000,"currency":"XAF","date":"2026-03-05"}
  ],
  "to_buy_items": [
    {"id":"tb1","name":"Baby monitor","status":"PLANNED","estimated_cost":65000,"actual_cost":null},
    {"id":"tb2","name":"Sofa 3 places","status":"DELIVERED","estimated_cost":230000,"actual_cost":250000},
    {"id":"tb3","name":"Smoke detector","status":"RESEARCHING","estimated_cost":30000,"actual_cost":null},
    {"id":"tb4","name":"Crib","status":"ORDERED","estimated_cost":140000,"actual_cost":null},
    {"id":"tb5","name":"Kitchen shelf","status":"IDEA","estimated_cost":45000,"actual_cost":null}
  ],
  "project": {"id":"pr1","name":"New Apartment Setup","progress_percent":42,"planned_cost":420000,"recorded_cost":250000}
}
```
