# Data Centre Customer Onboarding — frontend

React/TypeScript browser application for internal staff. Authentication and account lifecycle belong to Microsoft Entra ID; company contacts and visitors are business records, not customer-login accounts.

## Operating rules

Read the repository `AGENTS.md`, root `README.md` and `APPLICATION_CHANGE_PLAN.md`. ADMIN approves visitor requests. SECURITY verifies identity, records check-in and later records checkout. Backend role/session/state/time validation remains authoritative even if the UI hides or disables an action.

Do not start the complete application against a real database merely to run frontend tests. Backend startup workers can update visit/session records. Install dependencies, migrate, deploy, commit or push only with approval.

## Project map

- `src/main.tsx`: MSAL initialization, React root and router base.
- `src/App.tsx`: identity/site-settings/application-session bootstrap, immediate local locking, inactivity warning and logout.
- `src/api/`: authenticated session-header transport, bounded request work, backend site settings and complete company lookup.
- `src/auth/`: MSAL options, role gates, per-tab session state and inactivity behavior.
- `src/layout/`: feature routes, role-specific navigation and responsive shell.
- `src/pages/`: companies, contacts, visitor submission, request review, Security, dashboard and audit history/export.
- `src/components/`: reusable page/table/filter/loading/dialog controls.
- `src/types/` and `src/utils/`: handwritten API contracts and presentation/form/date helpers.
- `tests/`: Node helper tests plus isolated React/jsdom tests. Simulated-DOM boundaries do not contact Entra or a business database.

## Configuration boundaries

Browser `VITE_*` configuration is public and baked into the frontend build. It must not contain passwords, private keys or bearer tokens. The internal release workflow injects its approved values; do not copy workstation settings into the VM blindly.

Relevant build values are `VITE_API_BASE_URL`, `VITE_BASE_PATH`, `VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_REDIRECT_URI` and `VITE_ENTRA_API_SCOPE`. Redirect/base/API paths must agree with the approved environment.

Site location/timezone are not duplicated frontend constants. The authenticated backend `/auth/site-settings` supplies the approved non-secret fields before protected pages render. Changes require backend restart/browser reload coordination.

## Verification

Run from this `frontend` directory with the existing approved dependency installation:

```text
npm test
npm run lint
npm run build
```

- `test`: Node built-in runner over `tests/*.test.mjs`.
- `lint`: Oxlint.
- `build`: `tsc -b` then Vite, producing generated `dist/`. Do not edit generated output as a source fix.
- CI declares Node 22; a local Node 24 pass is not an exact CI-runtime reproduction.

`npm run dev` is local development, not production deployment. Entra login requires approved registration/network/configuration. These commands are references, not authorization to install or deploy.

## Safe change checklist

1. Reproduce the specific failure with a focused test. Preserve server roles, session ownership, idle policy, business/session audit separation and Security field minimization.
2. Bind drafts to record IDs and block duplicate writes. A timed-out mutation may have an unknown server outcome: never add automatic retries to business writes.
3. Use pagination/totals and complete company lookup rather than assuming the first 20 or 100 records are the full directory.
4. Ignore stale reads, reset company-dependent host choices, and keep the reviewed draft locked while confirming/submitting.
5. Show failures; distinguish a successful save from a failed subsequent refresh.
6. Run focused tests, the full suite, lint and build. Record real results and limits in the change register.
7. Obtain authorized browser/Entra/PostgreSQL/VM acceptance before release. Helper and simulated-DOM tests do not establish those integrations.

## Knowledge handover

The Obsidian vault is a source/evidence snapshot, not continuously synchronized documentation. Update affected notes and mappings deliberately after the final diff is approved; preserve historical provenance and do not turn local test results into deployment claims.
