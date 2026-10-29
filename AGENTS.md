# AGENTS.md — Data Centre Customer Onboarding

Instructions for any AI coding agent (Codex, OpenCode, Claude Code, Cursor, Copilot, Gemini CLI, etc.) and for human developers. This is the tool-neutral rules file. See "Maintaining the agent instruction files" at the bottom.

Internal CWS platform for data centre customer onboarding and visitor access. CWS staff manage customer companies and contacts, create visitor-access requests for them, approve or reject those requests, and SECURITY staff use an approved-visitor list to identify visitors and log check-in/out.

## Deployment context (read before judging "issues")
- Runs on an **internal VM, internal network only**. Users sign in through **Microsoft Entra ID** for the CWS tenant; there are no local accounts and customers have no login.
- CI/CD uses **self-hosted GitHub runners on that VM**. The runner builds, injects secrets/variables (Entra IDs, scopes, API base URL, paths) and deploys. Do not flag missing `.env` files, secret handling in workflows, scope/tenant values, nginx/systemd config or network exposure as repo defects. They live outside the repo and cannot be checked from a workstation off the internal network.
- Off-network sessions cannot reach Entra, the VM or the database. Do not try to run the app end to end; verify with static reading, type-checks and unit tests only.

## Repository layout
- `backend/` FastAPI + SQLAlchemy 2 + Alembic (PostgreSQL, psycopg). Entry: `backend/app/main.py`. One package per feature in `backend/app/modules/<name>/{router,service,models,schemas}.py`.
  - Auth: `core/security.py` (`decode_entra_token`) and `core/dependencies.py` (`get_entra_principal`, `get_current_principal`, `require_roles`). Roles ADMIN/OPS/SECURITY come from Entra app-role claims, not the DB. Protected business APIs additionally require an active `X-App-Session-ID` bound to the stable Entra subject.
  - Workflow: `requests/service.py` (SUBMITTED -> APPROVED/REJECTED/CANCELLED) and `security_portal/service.py` (PENDING_ARRIVAL -> CHECKED_IN -> CHECKED_OUT, or DENIED_ENTRY).
  - Every state change calls `audit/service.py:record_audit_log`.
- `backend/alembic/versions/` linear migration chain (23 files). Deploy script requires exactly one head. Latest: `202610290023` (identity-bound idle sessions); migration creation does not mean it has been applied locally or on the VM.
- `frontend/` React 19 + Vite + TypeScript + MSAL + Bootstrap. `src/App.tsx` (auth/session), `src/api/client.ts` (bearer fetch wrapper), `src/pages/<area>/`.
- `scripts/linux/{build,deploy,verify}_release.sh` and `.github/workflows/{ci,deploy-staging}.yml` release pipeline.
- `ENTRA_ONLY_APPLICATION_RESTRUCTURE_PLAN.md` is the authoritative design/permission spec. `docker-compose.yml` and `DOCKER.md` are local-dev only.

## Commands (taken from README/CI; reviewers do not run them)
- Backend: `cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload` (needs `backend/.env`).
- Frontend: `cd frontend && npm ci && npm run dev | npm run lint | npm test | npm run build` (`build` runs `tsc -b`; tests use Node's built-in runner and the existing TypeScript dependency).
- CI is configured to lint/test/build the frontend, run the backend unit tests, and import `app.main`. Backend tests live in `backend/tests/`. For configured local test settings, run them from `backend/` with `python -m unittest discover -s tests -p "test_*.py"`. Unit tests use mocked database sessions; do not start the app or run migrations to execute them.

## Rules for working here
- Ask before installing dependencies, running migrations, committing, pushing or deploying. Never print `.env` values or secrets.
- **Peer-review mode:** when the task is a review, do not edit, delete or reformat any source file. Report findings with file and line, and show suggested fixes as text. Only change code after the human explicitly asks.
- Keep roles server-side: every mutating route uses `require_roles(...)`. Do not add authorization that exists only in the frontend.
- Site time zone is `Indian/Mahe` (`settings.site_timezone`). Use it for any "today" / visit-window logic; do not use `date.today()` or UTC dates.
- Backend settings are the source for site timezone/location (`SITE_TIMEZONE`, `SITE_LOCATION`). The frontend loads only these non-secret fields from authenticated `/auth/site-settings` before rendering protected pages; do not duplicate site values in frontend constants.
- New business-data writes must call `record_audit_log` in the same transaction as the change. Owner-approved exception: session lifecycle/activity/connectivity belongs only in `user_session_events`, not `audit_logs`; do not duplicate session events in business audit logs or their normal exports.
- Workflow mutations lock the parent request before any visitor rows and refresh loaded state before checking transitions. Security detail reads use the same approval/historical-expiry visibility rule as the list.
- Session mutations use explicit internal-role dependencies and update `user_session_events` only, without duplicate audit records. Owner policy: 15-minute inactivity expiry and warning after 13 minutes. Heartbeats/ordinary API calls do not update `last_activity_at`; only user activity does. New sessions bind to stable Entra subject, not email. Raw Entra-only dependencies are reserved for identity/configuration/session bootstrap endpoints; business routes must require an active app session. Expired sessions must not be silently replaced by the frontend.
- Schema changes need an Alembic migration that keeps a single head.
- Match existing style: service functions raise `ValueError`/`PermissionError`, routers map them to HTTP errors.

## Known issues
The verified list, with locations, explanations and verification steps, is in `PEER_REVIEW_FINDINGS.md` (a standalone review document shared with the repo, not part of upstream; locate it by filename; reviewed at commit `b042e7d`). Treat it as hypotheses to confirm, not facts. Context and diagrams: `CODE_REVIEW.md`.

## Maintaining the agent instruction files

Different tools read different files. Keep **one source of truth** so they never drift:

| File | Read by | Role |
|---|---|---|
| `AGENTS.md` | Codex, OpenCode, Cursor and many others (an open convention) | **Canonical.** Edit rules here. |
| `CLAUDE.md` | Claude Code | Should contain only `@AGENTS.md` (imports this file) plus any Claude-specific notes. |
| Other tool files (e.g. `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/`) | That tool only | Add only if a tool does not read `AGENTS.md`; make each a one-line pointer to `AGENTS.md`. Check the tool's own docs for the exact filename. |

How to maintain:
1. Change rules only in `AGENTS.md`.
2. If `CLAUDE.md` is still a full copy (as it is until someone converts it), update both in the same change. Better: replace its body with the single line `@AGENTS.md`.
3. When a finding in `PEER_REVIEW_FINDINGS.md` is fixed or rejected, update its status there; do not copy findings into the rules files.
4. Never put secrets, tokens or real tenant/client IDs in any of these files.
5. Commit these files only with the repository owner's agreement (the repo is NimalSivakumar's).
