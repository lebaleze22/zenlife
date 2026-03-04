# Execution Plan MVP (Stack B, Planning-Only)

## 1. Cadre d'execution
- Duree: 8 semaines
- Sprint: hebdomadaire
- Mode: feature vertical slices (DB + API + UI)
- Objectif MVP: modules utilisables de bout en bout + suivi progression

## 2. Jalons
- Jalon A (S1-S2): socle technique (DB, backend skeleton, frontend data layer)
- Jalon B (S3-S4): ledger planning + budgets
- Jalon C (S5-S6): projects + to-buy + reserve + mark-recorded
- Jalon D (S7-S8): reports, reminders, import/export, stabilisation

## 3. Plan par semaine
### Semaine 1 - Foundation Core
- Setup backend Django/DRF + PostgreSQL
- Auth JWT + user profile
- Tables: users, accounts, categories
- Frontend: API client, error model, query layer
- DoD sprint:
  - migration DB appliquee
  - endpoints auth/accounts/categories operationnels
  - tests unitaires auth baseline

### Semaine 2 - Domain Base
- Tables: ledger_entries, projects, tobuy_items, todo_items
- CRUD API de base pour ledger/projects/todo/to-buy
- Frontend: types domaine v2 + pages routees vides
- DoD sprint:
  - CRUD e2e (create/read/update/delete) par module
  - 0 erreurs bloquantes sur parcours base

### Semaine 3 - Ledger Planning UX
- Ecran Ledger complet (filtres, add/edit, status planned/recorded)
- Validation formulaires (zod/react-hook-form)
- Search et pagination API
- DoD sprint:
  - 100% parcours ledger fonctionnel
  - tests integration filtres + pagination

### Semaine 4 - Budgets + Variance
- Tables budgets + budget_periods
- Calculs: planned, recorded, available
- Ecran budget avec ecarts
- DoD sprint:
  - calculs valides sur dataset test
  - alertes seuil 80/100%

### Semaine 5 - To-Buy Reservations
- Table planned_spend_reservations
- Endpoint reserve budget depuis To-Buy
- UI reserve/unreserve + contraintes
- DoD sprint:
  - reservation impossible si depassement budget
  - audit log action reserve

### Semaine 6 - Projects & Mark-Recorded
- Projects details: sections/rooms + checklist
- Endpoint `mark-recorded` (To-Buy -> LedgerEntry RECORDED)
- UI planned vs recorded par projet
- DoD sprint:
  - flux reserve -> mark-recorded stable
  - recalcul automatique des ecarts

### Semaine 7 - Reports + Reminders
- Endpoints reports: cashflow, net-worth, planned-vs-recorded
- Reminder engine (due soon / overdue)
- Dashboard branche sur donnees reelles
- DoD sprint:
  - plus de donnees aleatoires dashboard
  - reminders testes sur cas critiques

### Semaine 8 - Import/Export + Hardening
- Import CSV ledger
- Export JSON complet + restore valide
- QA transversale, perf, accessibilite, i18n
- DoD sprint:
  - checklist MVP complete
  - release candidate taggee

## 4. KPI de progression
- Progress MVP (%) = points_done / points_total_mvp
- Sprint completion (%) = tasks_done / tasks_committed
- Blocked ratio (%) = blocked_tasks / active_tasks
- Defect escape = bugs critiques post sprint

## 5. Gouvernance de suivi
- Daily: update des statuts (`todo`, `in_progress`, `blocked`, `done`)
- Weekly review:
  - planned vs delivered
  - blockers + mitigation
  - re-priorisation P0/P1
- Demo hebdo: au moins 1 flux complet demonstrable

## 6. Regles de priorite
- P0: bloque un flux MVP critique
- P1: important mais contournable
- P2: confort/amelioration

## 7. Definition of Done (globale)
Une tache est DONE si:
- code merge
- tests associes verts
- docs/API mises a jour
- validation UX/QA faite
- aucun bug critique ouvert sur la tache
