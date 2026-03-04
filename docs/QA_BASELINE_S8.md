# QA Baseline - Sprint S8

Date: 2026-03-04

## Regression Scope
- Accounts: archive + restore
- Budgets: compute + threshold alerts
- Planning: reservations, mark-recorded, audit logs
- Projects: sections/checklist + archive/restore
- Reports: cashflow, net-worth, planned-vs-recorded
- Portability: export + schema-versioned restore round-trip
- Notifications: due/overdue + budget threshold reminder generation

## Backend Test Baseline
Command:
`python manage.py test apps.accounts.tests apps.budgets.tests apps.notifications.tests apps.planning.tests apps.portability.tests apps.projects.tests apps.reports.tests`

Result:
- Tests found: 20
- Passed: 20
- Failed: 0
- Runtime: 14.867s

## Frontend Build Baseline
Command:
`npm run build`

Result:
- Build status: success
- Build time: 6.09s
- Main bundle: `dist/assets/index-D2yw1Z2O.js` = 734.51 kB (gzip 209.49 kB)

## Docker Runtime Baseline
Command:
`docker compose ps`

Result:
- `db`: healthy
- `backend`: up
- `frontend`: up

Ports:
- Frontend: `3000`
- Backend API: `8000`
- PostgreSQL: `5432`

## Residual Risks
- Frontend main chunk is still large (>500 kB warning).
- `manage.py test` without explicit labels does not discover all module tests in this layout; use explicit labels above for CI consistency.
