# Data Centre Customer Onboarding

MVP application for data centre customer onboarding and visitor access tracking.

This build contains the Entra-only onboarding foundation:

- FastAPI application structure
- PostgreSQL connection configuration
- SQLAlchemy business models for companies, contacts, requests, visitor access, and audit logs
- Alembic migration setup
- Microsoft Entra ID authentication and app-role authorization
- Audit actor snapshots from validated Entra claims

## Automatic visit closure

On backend startup and every 60 seconds, a background worker checks approved requests using the configured site timezone (default `Indian/Mahe`):

- Visitors still `PENDING_ARRIVAL` after their visit date become `NO_SHOW`.
- A request becomes `EXPIRED` only when all visits are in the past and every visitor is `CHECKED_OUT`, `DENIED_ENTRY`, or `NO_SHOW`.
- `CHECKED_IN` visitors are not automatically checked out and prevent request expiry.
- Each transition is audited as a system action in the same transaction. Past-date security lists include expired requests so visitor history remains visible.

This also processes existing historical records on the first run. It runs only while the backend is running and catches up after downtime. No schema migration is needed for these rules.

## Audit history

Audit logs support Previous/Next pagination and server-side date filtering in the configured site timezone. **Export all matching logs** fetches every matching stored record in batches, not just the displayed page. The timeline groups related activity; exports retain all stored events. Export runs with the existing ADMIN/OPS permissions and does not modify audit data. Newer records arriving after the first export batch may require a fresh export; the export is not a transaction-wide database snapshot. Very large exports are assembled in browser memory, so selecting a narrower date range is recommended.

## Backend Quick Start


```powershell
cd "Data Centre Customer Onboarding\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set your PostgreSQL password in `DATABASE_URL`.

Run migrations:

```powershell
alembic upgrade head
```

Start the API:

```powershell
uvicorn app.main:app --reload
```

Open:

```text
http://localhost:8000/docs
```

## Frontend Quick Start

In a second terminal, keep the backend running and start the React frontend:

```powershell
cd "Data Centre Customer Onboarding\frontend"
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

The frontend calls the backend using:

```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
```

## Local Microsoft Entra Login

The app uses Microsoft Entra ID only. Local username/password login and customer login accounts are not supported.

For localhost testing, the Entra app registration must include this SPA redirect URI:

```text
http://localhost:5173
```

Add the Entra values to your real `frontend/.env` file:

```env
VITE_ENTRA_TENANT_ID="97df7dc2-f178-4ce4-b55e-bcafc144485e"
VITE_ENTRA_CLIENT_ID="304a3bcf-af30-4104-9ebb-a256a201cb43"
VITE_ENTRA_REDIRECT_URI="http://localhost:5173"
```

Add the Entra values to your real `backend/.env` file:

```env
ENTRA_TENANT_ID="97df7dc2-f178-4ce4-b55e-bcafc144485e"
ENTRA_CLIENT_ID="304a3bcf-af30-4104-9ebb-a256a201cb43"
```

The backend validates the Microsoft Entra access token and authorizes requests from Entra app-role claims. Supported application roles are `ADMIN`, `OPS`, and `SECURITY`.

Only `ADMIN` can approve visitor requests. `ADMIN` and `OPS` can create/view requests and retain reject/cancel permissions. Having OPS without ADMIN is not sufficient for approval. This role restriction does not prohibit an ADMIN from approving a request they created.

The Security portal displays visitor name, full NIN, request number, visitor status, expected arrival/departure, customer company, equipment carried, and actual check-in/check-out timestamps. Its API returns only these fields plus visitor record ID and visit date needed for actions/filtering. Other personal/contact fields and security notes are not returned by Security portal endpoints; their storage and ADMIN/OPS operational-request access are unchanged. Recording a denial reason is still supported. Auditing detail views is a separate pending owner decision.

Security list and detail reads share the same visibility rule: approved requests and historical expired visits. Security button date/window checks use Indian/Mahe explicitly, regardless of the browser timezone. Review/cancellation and Security actions lock the parent request before visitor records; live PostgreSQL concurrency verification remains pending.

Session start, activity, heartbeat, explicit end, and inactivity timeout create audit records alongside their writes. Session records remain excluded from the visible audit timeline but are retained in full exports. Inactivity expiry is now an application access control, as described below; audit retention remains a separate policy decision.

Session tracking records are excluded from the visible audit timeline and its pagination totals. Full exports still include all matching stored records, including session events; existing records are not deleted. The API supports `exclude_session_events=true` for timeline queries without changing the default full-history behavior.

New request-submission audit entries include all visitor names and the visitor count. Older entries with only one recorded name remain historical: single-visitor entries use the label `Visitor`; multi-visitor entries disclose missing audit names rather than inventing them. Full request/visitor records remain unchanged.

Site configuration comes from backend `SITE_TIMEZONE` (default `Indian/Mahe`) and `SITE_LOCATION` (default `Cable & Wireless, Victoria`). The authenticated `/api/v1/auth/site-settings` endpoint returns only these two non-secret values. The frontend loads them before protected pages render and uses them for the request location, Security visit-window/date checks, and timestamp display. Server-side request creation uses the configured location, not a client override. Configuration changes require a backend restart and browser reload. Deploy frontend/backend together: the updated frontend requires this endpoint. No database migration is needed.

### Application inactivity logout (owner policy)

- The app warns after **13 minutes** and signs out after **15 minutes** without trusted mouse/pointer, keyboard, touch, or scrolling activity. `Stay signed in` renews a still-active session. Hidden-tab events, synthetic events, background heartbeats and ordinary API calls do not count as user activity. Timers check elapsed time, including browser sleep; a wake-up event cannot revive an already-expired session.
- Actual activity is reported through `/auth/sessions/{id}/activity`, debounced to avoid a request on every input event. Heartbeats record connectivity only. Reload/resume uses the backend's remaining idle duration, not a fresh 15 minutes. Sessions are per tab; activity is not synchronized between tabs. A backend outage may expire a session even while the user is locally active; the UI shows activity-report failures instead of treating failed requests as successful renewals.
- Protected business APIs require both a valid Entra bearer token and `X-App-Session-ID`. The session must belong to the token's stable tenant/object subject, be open, and have activity within 15 minutes. The backend checks this on every request, independently of the periodic timeout worker. Ended/expired/legacy/foreign sessions cannot be renewed through heartbeat or activity calls.
- `/auth/me`, `/auth/site-settings`, and session bootstrap/lifecycle routes use Entra authentication without the business-session dependency; lifecycle routes validate ownership/state themselves. Entra tokens are still issued/validated by Microsoft. The frontend locks immediately, attempts to close its session and calls MSAL logout. It requires an explicit sign-in action rather than silently creating a replacement from cached Microsoft authentication. This does not globally revoke all existing Entra access tokens; Microsoft controls reauthentication/SSO policy. Clients can explicitly establish a new app session using valid Entra authentication.
- **Migration required before deploying this feature:** `backend/alembic/versions/202610290023_application_idle_sessions.py` adds nullable `actor_subject` and timezone-aware `last_activity_at` to `user_session_events`. Legacy rows are preserved with NULL identity/activity and cannot authorize access; do not backfill ownership by email. Existing users must sign in again. Apply the migration on each database through the approved release process before starting the updated backend, and deploy the matching frontend. **Local Docker migration was applied with owner approval on 2026-10-29**, then revision/columns/indexes verified read-only. The VM database was not changed; migration is still required there during the coordinated release. No historical audit/session data was rewritten.

There are no local test users or password-login accounts in the application. Test access is assigned in Microsoft Entra.
