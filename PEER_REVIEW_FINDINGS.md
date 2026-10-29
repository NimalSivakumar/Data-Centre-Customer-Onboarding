# Peer Review Findings — Data Centre Customer Onboarding

Original review at commit `b042e7d` (main) was read-only: **no source code was changed during that review**. Later owner-approved fixes are recorded below. Companion to `CODE_REVIEW.md` (system map, diagrams, backlog).

## Current implementation status — 2026-10-29

The original descriptions are retained as historical evidence; they are not all outstanding tasks.

**Latest follow-up (2026-10-29): 119 backend tests and 50 frontend helper tests pass; frontend build passes; lint retains four existing hook-dependency warnings.** Owner clarification: session lifecycle/activity/connectivity must remain only in `user_session_events`; duplicate session audit writes are removed and normal audit views/totals/exports exclude legacy session audit rows. Business audits and P5 (15-minute inactivity expiry/13-minute warning) remain unchanged. No new migration or deletion was performed. Migration `202610290023` remains the single head (23 revisions), previously applied/verified on local Docker with approval. No VM deployment, browser verification, live concurrency testing, staging, commit, or push was performed for this correction. Earlier audit-duplication/export policies/counts describe superseded checkpoints.

| Finding | Current local status |
|---|---|
| F1 | Contact edit fixed; contact-update unit tests added. |
| F2 | Original timezone locations and remaining Security button checks corrected. Shared frontend timing uses Indian/Mahe explicitly; backend and frontend boundary tests added. Browser verification remains pending. |
| F3 | Login redirect uses Vite `BASE_URL`; deployed subpath authentication recovery remains to be verified. |
| F4 | PostgreSQL sequence and migration 202607130022 implemented. Local Docker revision/sequence verified read-only; VM status unknown. |
| F5 | Past dates and non-ACTIVE companies rejected; request-validation unit tests added. |
| F6 | Automatic NO_SHOW/EXPIRED worker implemented with unit tests; live expiry/concurrency verification pending. |
| F7 | Review/cancel and security mutations now lock the parent request before visitor rows and refresh state; expiry follows the same lock order. Deny-entry checks approval. Mocked/query regression tests pass; live PostgreSQL concurrency verification remains pending. |
| F8 | Implemented: company, request, and security searches escape literal wildcards; six unit tests added. Live PostgreSQL search verification pending. |
| F9 | Duplicate pre-checks and database-error translation/rollback implemented with unit tests. Live racing submissions and case-insensitive DB uniqueness remain outside this verification. |
| F10 | Original stale password/user endpoint sections corrected in README/API list. |
| F11 | Implemented: renamed Contacts page/form and folder, removed unused page prop and My Requests branch. Frontend build passed. |
| N1 | Implemented: audit pagination, server-side site-date filters, and all-matching-record export with timestamp/ID cursor batches. Unit tests/build passed; browser/live PostgreSQL verification pending. |
| N2 | Implemented: Security detail reads share the list's approved/historical-expired visibility predicate; unavailable records return 404. |
| N3 | Owner clarified separation: session mutations retain role checks and update user_session_events only; duplicate audit inserts removed. Legacy session audit rows are excluded from timeline/totals/exports. P5 backend-enforced inactivity expiry remains enabled. |

Verification: **95 backend unit tests and 21 frontend helper tests pass**; frontend build passes and lint reports four existing hook-dependency warnings. Tests use mocked database sessions, frozen clocks, compiled PostgreSQL queries, and fake export batches; they do not prove live rollback, concurrent PostgreSQL behavior, or browser/Entra integration. A previous separate read-only local Docker check confirmed revision 202607130022, the request-number sequence, and the customer-code unique constraint. No migration or database-writing verification was run for these follow-up changes. CI has backend/frontend test steps configured; remote CI has not been run. Owner-approved policies: ADMIN-only approval (P1), minimized Security fields (P3), and ADMIN self-approval remains allowed. P3 read auditing and P4/P5/P6 remain owner decisions; P2 matches staff-only submission. Follow-up timezone, locking, visibility, and session-audit fixes require no new migration; VM deployment is unverified.

## How to use this document

**Developers:** each finding says *where* the problem is, *what* is wrong in plain terms, *why* it matters, and *how to check it yourself*. Do not trust the finding blindly; reproduce it from the code first.

**AI coding agents (any tool or model):** this document is plain Markdown and does not depend on any specific agent. Treat every finding as a hypothesis, not a fact. Start in read-only mode (or "ask before editing"). For each finding:

1. Open the cited file and line. Lines drift, so search for the quoted code if the line is off.
2. Follow the "How to verify" steps and decide: **CONFIRMED**, **NOT AN ISSUE** (explain why), or **UNCERTAIN** (say what you could not check).
3. Report your verdict and reasoning to the human **before** changing anything.
4. Only after the human approves, apply the smallest fix, matching the surrounding style.

**Files to read first** (all plain Markdown, in this order):
1. The project rules file: `AGENTS.md` in the repo root (tool-neutral; `CLAUDE.md` is the same rules for Claude Code, so read only one). The rules are repeated below so this document works on its own.
2. `CODE_REVIEW.md`: system map, diagrams and backlog.

(`CODE_REVIEW.md` and this file are standalone review documents shared alongside the repo; they may sit in the repo root, a `docs/` folder, or anywhere else. Find them by filename. They are not part of the upstream repository.)
3. This file.

**Project rules (summary of `AGENTS.md`):**
- Ask before installing dependencies, running migrations, committing, pushing or deploying. Never print `.env` values or secrets.
- Every mutating route keeps its server-side role check (`require_roles(...)`). Do not add authorization that exists only in the frontend.
- "Today" and visit windows use the site time zone (`settings.site_timezone`, default `Indian/Mahe`), never `date.today()` or UTC dates.
- Every new business-data write calls `record_audit_log` in the same transaction. Owner-approved exception: session lifecycle/activity belongs only in `user_session_events`, without duplicate business-audit entries.
- Schema changes need an Alembic migration that keeps a single head.
- Match existing style: service functions raise `ValueError`/`PermissionError`; routers map them to HTTP errors.

**Out of scope (do not report as defects):** `.env` and secret handling, Entra tenant/scope/client values, nginx/systemd, network exposure, CI runner configuration. These live outside the repo on the internal VM (see "Deployment context" in the rules file). The app cannot be run end to end off-network, so verify by reading, type-checking and unit tests only.

**Ready-to-paste starting prompt:**

> Read `AGENTS.md` (project rules), `CODE_REVIEW.md` and `PEER_REVIEW_FINDINGS.md` (find them by filename; they may not be in the repo). The code is at commit `b042e7d`. For each finding, check it against the source and tell me whether it is confirmed, not an issue, or uncertain, with your reasoning and the exact lines you looked at. Do not edit files, install anything or run migrations until I approve. After approval, make the smallest fix for one finding at a time and show me the diff.

Severity: **High** = breaks a feature or lets wrong data through. **Medium** = wrong behaviour in some conditions. **Low** = cleanup/docs.
Status: **Confirmed** = I read the code and the failure follows directly. **Likely** = follows from the code but depends on something I could not check. **Policy** = a business decision, not a code bug.

---

## Part A — Defects in the code

### F1 — Updating a contact crashes with HTTP 500 (High, Confirmed)

- **Update (2026-10-29): Implemented; contact-update regression coverage added.** The invalid `contact.user` audit field has been removed, and PATCH maps duplicate-email `ValueError`s to HTTP 400. `backend/tests/test_contact_update.py` covers real edits without a user relationship, Entra actor/before-after audit data, no-op updates, clearing optional fields, duplicate-email rejection, route responses, audit failure, and the route's ADMIN/OPS role dependency. Tests use a mocked database session; live persistence and HTTP integration verification remain pending. Original observations below describe the reviewed baseline.

- **Where:** `backend/app/modules/contacts/service.py`, in `update_contact`, line 84:
  `"account_email": contact.user.email if contact.user else None,`
- **What is wrong:** The `Contact` model no longer has a `user` attribute (the column was dropped in migration `0011`; see `backend/app/modules/contacts/models.py`). Reading `contact.user` raises `AttributeError`. This line runs whenever at least one field actually changed, so every real edit fails.
- **Why it matters:** The Contacts page edit form calls this endpoint, so editing a contact does not work. The error is hidden until someone saves a change.
- **How to verify:** Open `contacts/models.py` and confirm there is no `user` field or relationship. Search the codebase for `\.user\b` on contact objects. Note that a PATCH that changes nothing skips the audit block, so it would *not* crash. That is why it was easy to miss.
- **Suggested fix:** Delete the `account_email` line. If an account email is still wanted in the audit record, it has no source any more; do not invent one.
- **Suggested test:** Call `update_contact` with a stub session and a contact object that has no `user`, changing one field. Expect one `CONTACT_UPDATED` audit call whose `metadata["target"]` has no `account_email`.

### F2 — "Today" is computed in the wrong time zone in three places (Medium, Confirmed in code / Likely in effect)

- **Update (2026-10-29): Original locations and remaining frontend button checks corrected.** `backend/tests/test_site_time.py` covers configured site dates around midnight, month/year rollover, dashboard summaries, session timestamps, request-number dates, and security date/window checks. `frontend/src/pages/security/securityTiming.ts` now supplies the default date, check-in window, and scheduled-day/deny checks using explicit Indian/Mahe parts, not browser-local date parsing. Six frontend timing tests cover different host timezones, midnight/year rollover, inclusive windows and fractional seconds. Browser tests and synchronization with any future backend timezone override are not covered. Original observations below describe the baseline.

- **Where:**
  - `backend/app/modules/dashboard/router.py` lines 19 and 27: `date.today()` (uses the server's local zone).
  - `frontend/src/pages/security/SecurityPage.tsx` line 17: `new Date().toISOString().slice(0, 10)` (this is the **UTC** date).
  - `backend/app/modules/session_events/service.py` line 17: `ZoneInfo("Indian/Mahe")` hardcoded instead of `settings.site_timezone`.
- **What is wrong:** The project rule is that the site zone (`settings.site_timezone`, default `Indian/Mahe`, UTC+4) decides what "today" is. `security_portal/service.py:get_site_now` does this correctly; these three places do not.
- **Why it matters:** If the VM clock is UTC, between 00:00 and 04:00 local time the dashboard counts and the security page's default date show *yesterday*. Security staff could look at the wrong day's visitor list. The browser's UTC date is wrong regardless of the VM setting.
- **How to verify:** Read `get_site_now` in `security_portal/service.py` as the correct pattern. Check which zone the VM uses (cannot be checked off-network; ask the user). Evaluate `new Date().toISOString()` at 01:00 Seychelles time: it returns the previous calendar day.
- **Suggested fix:** Add one shared helper (e.g. `site_today()` using `settings.site_timezone`) and use it in the dashboard router and `session_events`. In the frontend use `toLocaleDateString('en-CA', { timeZone: 'Indian/Mahe' })` (the `en-CA` locale gives `YYYY-MM-DD`).

### F3 — Session-expired redirect ignores the app's base path (Medium, Confirmed)

- **Where:** `frontend/src/api/client.ts` line 25: `window.location.assign('/login')`.
- **What is wrong:** The deployed build is served under `/dc-onboarding/` (Vite `base`, see `frontend/vite.config.ts` and the router base name in `frontend/src/main.tsx`). An absolute `/login` leaves the app and lands on the host's root, not the app's login route (`frontend/src/App.tsx` line 159).
- **Why it matters:** After any 401 the user is sent to a page that does not exist.
- **How to verify:** Compare with `routerBaseName` in `main.tsx`. Check how `VITE_BASE_PATH` is set in the build script.
- **Suggested fix:** Use ``${import.meta.env.BASE_URL}login`` or, better, navigate through the router / trigger MSAL sign-in rather than a hard redirect.

### F4 — Request numbers can collide under concurrent creates (Medium, Confirmed)

- **Where:** `backend/app/modules/requests/service.py`, `generate_request_number`, lines 20-22: `count + 1` over all requests.
- **What is wrong:** Two requests created at the same moment both read the same count and produce the same number. Also, the count is over *all* requests but the prefix is a date, so numbers are not per-day. The date uses UTC, not the site zone.
- **Why it matters:** `request_number` has a unique index (check `requests/models.py`), so the second insert fails with an unhandled integrity error (HTTP 500). Deleting a row would also make numbers repeat.
- **How to verify:** Read the model for the unique constraint. Reason through two overlapping transactions.
- **Suggested fix:** Use a PostgreSQL sequence (needs an Alembic migration with a single head) and format the number from it.

### F5 — Visitor requests accept past dates and non-active companies (High, Confirmed)

- **Update (2026-10-29): Implemented; 13 request-validation regression tests added.** `create_visitor_access_request` rejects past site dates and every non-ACTIVE company status. `backend/tests/test_visitor_request_validation.py` covers rejection before writes, today's/future visits, required active host, time-order validation, readable route errors, audit creation/failure, and ADMIN/OPS authorization. All 44 backend unit tests passed after this addition. Tests use a mocked database session; live persistence/HTTP verification remains pending. Original observations below describe the reviewed baseline.

- **Where:** `backend/app/modules/requests/service.py`, `create_visitor_access_request`, starting line 75. Input model: `backend/app/modules/visitor_access/schemas.py`, `VisitorAccessCreate`.
- **What is wrong:** `VisitorAccessCreate` validates only that departure is after arrival. It does not check `visit_date >= today` (site zone). The service checks that the company *exists* but not that `company.status == "ACTIVE"`. `CompanyStatus` also has `PENDING`, `SUSPENDED`, `CLOSED` (`backend/app/shared/enums.py`).
- **Why it matters:** Staff can approve visits for suspended or closed customers, or for dates already gone. Security would then see those visitors on the approved list.
- **How to verify:** Trace the function from the top; confirm there is no status or date check. Check the frontend form for client-side limits (those do not count; the server must enforce).
- **Suggested fix:** Raise `ValueError` for non-ACTIVE companies and for dates before the site-zone "today". Cover both with unit tests.

### F6 — `EXPIRED` and `NO_SHOW` statuses are never set (Medium, Confirmed)

- **Update (2026-10-15): Implemented; pending deployment/runtime verification.** `backend/app/modules/requests/expiry.py` checks on startup and every 60 seconds. Past-date pending visitors on approved requests become `NO_SHOW`; approved requests become `EXPIRED` only when every visitor is past-date and `CHECKED_OUT`, `DENIED_ENTRY`, or `NO_SHOW`. `CHECKED_IN` remains unresolved. Changes and system audit records commit together. Historical security lists retain expired visits. No migration required. Unit tests in `backend/tests/test_visit_expiry.py` cover these rules and query locking; no live database checks were run. Original observations below describe the reviewed baseline.

- **Where:** Enums in `backend/app/shared/enums.py` (lines 40 and 47). A search of `backend/app` finds no code that assigns them.
- **What is wrong:** Visits that were approved but never happened stay `PENDING_ARRIVAL` forever, and requests never expire.
- **Why it matters:** Reporting and the security list cannot tell "still expected" from "never came". Stale approvals remain in the data.
- **How to verify:** `grep -rn "NO_SHOW\|EXPIRED" backend/app --include=*.py`. Only the enum definitions match.
- **Suggested fix:** A scheduled job (or an explicit staff action) that moves past-date items to these statuses with an audit entry. Needs a policy decision on when. See P1.

### F7 — No row locking and loose status checks in the security portal (Medium, Likely)

- **Update (2026-10-29): Parent-first workflow locking implemented.** Approval/rejection/cancellation routes use `get_request_for_update`; Security mutations resolve the visitor's parent, lock/refresh that request, then lock/refresh the visitor. Expiry uses the same parent-first order and refreshes request state. This serializes cancellation/review against Security transitions instead of relying solely on visitor locks. Existing state-transition policy is unchanged: cancellation after a completed check-in is not newly prohibited. Regression tests in `backend/tests/test_workflow_locking.py` inspect lock ordering, refresh options, route loaders, and cancelled-parent guards. Live PostgreSQL race verification remains pending. Original observations below describe the baseline.

- **Where:** `backend/app/modules/security_portal/service.py`: `check_in_visitor` (line 115), `check_out_visitor` (146), `deny_visitor_entry` (174).
- **What is wrong:** The visitor row is read and updated without `SELECT ... FOR UPDATE`, so two guards acting at once can both pass the status check. `deny_visitor_entry` appears not to check the parent request's status (compare to check-in, which does). I did not run concurrent requests.
- **Why it matters:** Double check-in, or denying entry on a request that was cancelled or is not approved, corrupts the visit history.
- **How to verify:** Read each function and list which status checks it makes. Look for `with_for_update` (none exists in the file).
- **Suggested fix:** Load the row with `with_for_update()` inside the transaction; make `deny_visitor_entry` apply the same request-status check as check-in.

### F8 — Search terms are not escaped for `LIKE` wildcards (Low, Confirmed)

- **Update (2026-10-29): Implemented with six search regression tests.** `backend/app/shared/search.py:contains_pattern` escapes backslash first, then percent and underscore. Company, request, and security search fields use this pattern with an explicit SQL `escape` argument; company/request count queries share the same conditions as list queries. Case-insensitive contains matching is preserved. `backend/tests/test_search_patterns.py` verifies escaping and compiled PostgreSQL query expressions without a database connection. No schema migration required. Original observations below describe the reviewed baseline.

- **Where:** `ilike(pattern)` with `pattern = f"%{q}%"` in `requests/service.py` (lines 47-54), `security_portal/service.py` (lines 99-104), `companies/service.py` (lines 30-34).
- **What is wrong:** `%` and `_` typed by the user act as wildcards. Not an injection (values are bound), only surprising matches.
- **Suggested fix:** Escape `%`, `_` and `\` in `q` and pass `escape="\\"`.

### F9 — Duplicate `customer_code` probably returns 500 (Low, Likely)

- **Update (2026-10-29): Implemented; PostgreSQL concurrency verification remains pending.** Company creation and updates retain duplicate pre-checks and now translate PostgreSQL unique violations for `companies_customer_code_key` into a readable HTTP 400, with transaction rollback. Other integrity errors are not mislabeled. Regression tests are in `backend/tests/test_company_customer_code.py`. No schema migration required. The database's existing case-sensitive unique constraint is unchanged; simultaneous codes differing only by case are not guaranteed to be rejected by that constraint. Original observations below describe the reviewed baseline.

- **Where:** `backend/app/modules/companies/models.py` line 16 (`unique=True`); company create in `companies/service.py`.
- **What is wrong:** The unique column is enforced by the database, but I did not find a pre-check like the one contacts use for email. A duplicate would raise `IntegrityError`.
- **How to verify:** Read `create_company` for a lookup before insert, and the router for an `IntegrityError` handler.
- **Suggested fix:** Check first and raise `ValueError("... already exists")` so the router returns a 4xx.

---

## Part B — Documentation and leftovers

### F10 — README and API list describe features that were removed (Low, Confirmed)

- **Where:** `README.md` line 68 says Entra-only with no password login, but line 95 onward still describes a seed script creating users with a password. `backend/API_ENDPOINTS.txt` documents `/auth/login`, `/auth/change-password` and `/companies/{company_id}/users` (lines 12, 20, 36), which no longer exist.
- **Why it matters:** New developers will try to log in or call endpoints that are gone. The README contradicts itself.
- **How to verify:** Compare with the routers under `backend/app/modules/*/router.py` and `backend/app/modules/auth/router.py`.
- **Suggested fix:** Regenerate the endpoint list from the real routes (FastAPI serves `/docs`); delete seed/password sections.

### F11 — Leftover names from the old customer-login design (Low, Confirmed)

- **Update (2026-10-29): Implemented; frontend TypeScript/Vite build passed.** The page/form now live at `frontend/src/pages/contacts/ContactsPage.tsx` and `ContactForm.tsx`. Shell imports/routes use `ContactsPage` without the unused mode prop. Requests use a fixed `Requests` title; existing role gates and action permissions are unchanged. No old ContactsUsers/contacts-users/My Requests references remain in frontend TypeScript sources. Original observations below describe the reviewed baseline.

- **Where:** `frontend/src/pages/requests/RequestsPage.tsx` line 61 shows the title `'My Requests'` for users who cannot review. `frontend/src/pages/contacts-users/ContactsUsersPage.tsx` lines 13-15 keep a `page: ContactsUsersPageMode` prop that has only one value, in a folder still named "contacts-users".
- **Why it matters:** Confusing, and the "My Requests" branch reads as if customers log in. They do not.
- **Suggested fix:** Rename, drop the unused prop, and check whether the non-reviewer branch is reachable at all (SECURITY role?).

---

## Part C — Security and policy questions (need a human decision)

These are not necessarily bugs. An agent should **explain the trade-off and ask**, not "fix".

- **P1 — Approval policy updated by owner (2026-10-29): ADMIN only.** Approval now requires ADMIN in both the route role dependency and service. Frontend approval controls are ADMIN-only; reject/cancel permissions for ADMIN/OPS are unchanged. An ADMIN who also created the request may still approve it: the owner requested a role restriction, not a different-person check. Tests: `backend/tests/test_request_approval.py` and `frontend/tests/requestPermissions.test.mjs`. No migration required; live Entra/browser verification remains pending.
- **P2 — Customers cannot submit requests**; staff enter them on the customer's behalf. Confirm this matches the business intent.
- **P3 — Field policy implemented (owner decision, 2026-10-29); read auditing pending.** Security portal schema/mapper/UI now expose only visitor name, full NIN, request number, visitor status, expected arrival/departure, customer company, equipment, and check-in/out times, plus visitor record ID/visit date for operations. Phone/email/address/employer/vehicle/host/site/visit purpose/instructions/security notes are omitted from list, detail, and action responses. Search uses visitor name, NIN, request number, and customer company, not hidden employer/contact fields. Other operational APIs and stored data are unchanged. Tests: `backend/tests/test_security_visitor_privacy.py` and `frontend/tests/securityVisitorDetails.test.mjs`. Full NIN remains visible by owner choice. Whether to audit detail reads is still undecided. Live browser verification remains pending; no migration required.
- **P4 — Audit log**: it is an ordinary table that code with DB access can edit, and audit metadata stores full company/contact payloads (e.g. `companies/service.py` line 80). Decide on retention and tamper-evidence.
- **P5 — Implemented locally: owner approved 15-minute inactivity logout (2026-10-29).** The frontend warns at 13 minutes and signs out at 15 minutes without trusted visible-tab input. Heartbeats/polling do not renew inactivity; resume uses remaining server time, and expired sessions cannot be silently replaced. Backend business APIs enforce stable-subject ownership and idle expiry under a row lock. MSAL logout is attempted; global Entra token revocation/SSO prompts remain Microsoft's responsibility. Explicit authenticated bootstrap remains available; sessions are per tab. Owner clarification: lifecycle/activity updates are stored only in `user_session_events`, without duplicate audit inserts. Migration `202610290023` remains applied/verified on local Docker only; no new migration is required for separation. VM/browser/runtime behavior remains unverified. Tests: `test_idle_session_enforcement.py`, `test_session_tracking.py`, `inactivity.test.mjs`, `applicationSession.test.mjs`, `apiSession.test.mjs`.
- **P6 — `is_authorised_requester`** exists on `Contact` (`contacts/models.py:22`, set in `companies/service.py:67`) but nothing enforces it. Either use it or remove it. The host is also matched by name string rather than contact id (`requests/service.py`, host lookup).
- **P7 — Automated test coverage (updated 2026-10-29).** 119 backend tests and 50 frontend helper tests pass. Coverage includes previous features, exact idle boundaries, non-renewing heartbeats/business requests, identity binding, protected route graphs, legacy/ended/foreign rejection, session-only writes without duplicate audit inserts, and session exclusion in audit counts/cursor export batches. UI helpers cover warning/input/sleep behavior, session headers and bootstrap/resume. CI is configured with dummy backend settings and no database service; remote CI has not run. Migration 0023 was applied/verified locally. Full state-machine, browser/component/MSAL, PostgreSQL concurrency and VM release verification remain outstanding.

---

## N1 — Audit history and exports only included the first 50 records

- **Update (2026-10-29): Implemented; live/browser verification pending.** `AuditPage.tsx` now requests numbered pages, displays total records and Previous/Next controls, resets pagination on date changes, and ignores stale load responses. Dates are sent as `from_day`/`to_day` and interpreted by the backend in `settings.site_timezone`; the upper bound is exclusive next-day midnight, preserving fractional seconds on the selected end date.
- Export uses `auditPagination.ts:loadAuditExport` to fetch batches of up to 100 using `(created_at, id)` cursors instead of offset pages. Every matching stored audit record is exported, including related events grouped out of the timeline. Failed/repeated batches reject without producing a partial CSV. This is not a transaction-wide snapshot; new records after export begins may require a fresh export. Large exports are assembled in browser memory.
- Existing timestamp filters and ADMIN/OPS permissions are retained. No migration or audit-data writes were introduced. Tests: `backend/tests/test_audit_pagination.py` and `frontend/tests/auditPagination.test.mjs`.

## Not yet reviewed (be honest about gaps)

The original review did not cover Companies, Dashboard and Audit frontend pages in full, shared components, CSS, most migrations, or the full plan. Subsequent focused work covered audit pagination/export, Security timing/privacy, workflow locking, and session access/separation, but is not a complete application or migration-chain audit. There are now 23 migration revisions; the idle-session migration was applied locally only.

## N2 — Security detail visibility bypass

- **Implemented (2026-10-29):** GET detail now calls `get_visible_security_visitor`, sharing `security_visibility_filter` with the list: APPROVED requests, or EXPIRED requests whose visitor date is before site today. Submitted/rejected/cancelled or missing records return 404 rather than leaking even the minimized details. Internal post-mutation reloads remain separate, so a permitted action is not invalidated by a subsequent status change. No new read auditing or schema changes. Tests: `backend/tests/test_workflow_locking.py`.

## N3 — Session role checks and dedicated tracking storage

- **Updated by owner clarification (2026-10-29):** Explicit ADMIN/OPS/SECURITY checks, locking, state refresh, timeout retries, and 15-minute backend enforcement are retained. Session start/activity/heartbeat/end/timeout now update only `user_session_events`; all duplicate `record_audit_log` calls were removed. Normal audit API queries, timeline totals, and every CSV cursor batch exclude legacy `user_session` audit rows. Existing records are preserved; no database cleanup or migration was performed. The canonical rules now explicitly exempt session tracking from business-data audit requirements. Tests: `backend/tests/test_session_tracking.py`, `test_idle_session_enforcement.py`, `test_audit_pagination.py`, and `frontend/tests/auditPagination.test.mjs`.

## N4 — Submission audit showed only the first visitor; duplicated site constants

- **Implemented (2026-10-29):** New REQUEST_SUBMITTED records snapshot `visitor_full_names` for every submitted visitor, preserving ordering/duplicate names alongside the real count. Timeline and CSV formatting show `Visitor` for one visitor, or numbered visitor names for several. Legacy single-name records display `Visitor` for count 1; legacy multi-visitor records label the known name as `Recorded visitor` and disclose that other names were not captured. Historical logs are not rewritten or presented as complete snapshots. Other submitted details remain in operational records; no new full-PII audit snapshot is introduced.
- Removed duplicated location constants and frontend timezone literals. Backend `SITE_LOCATION` (default unchanged) and `SITE_TIMEZONE` are validated settings. Authenticated GET `/auth/site-settings` exposes only these two fields, never the full settings object. The frontend loads them before protected pages render; request location, Security date/window checks, and timestamp display use the server configuration. Submitted location overrides remain ignored, preserving the existing single-site policy. Roles, statuses, development URL fallbacks, migration timestamps, and frozen test dates are intentional and were not blanket-replaced. No new migration, database write/backfill, or deployment; synchronized backend/frontend release and browser verification remain pending.

## Quick triage order

1. F1 (feature broken now) and F5 (wrong data accepted) — fix first.
2. F2, F3, F4 — correctness under real conditions.
3. F7, F9 — hardening.
4. F6 and the P-items — need a decision from the owners before any code.
5. F8, F10, F11 — cleanup.
