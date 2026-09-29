# Entra-Only Application Restructure Plan

## 1. Purpose

This document is the implementation specification for restructuring the Data Centre Customer Onboarding application so that:

- Microsoft Entra ID is the only authentication provider.
- Only internal staff can sign in.
- Internal users are managed by Entra administrators, not by this application or its database.
- Entra app roles provide the application's `ADMIN`, `OPS`, and `SECURITY` permissions.
- Customers do not receive login accounts.
- A customer is represented by a company and its contacts.
- `ADMIN` and `OPS` can create, view, and modify company/customer details and company contacts.
- Visitor requests are created and managed by authorized internal users.
- The application database stores business records and immutable audit evidence, not user accounts.

This is a migration of authentication, authorization, frontend navigation, backend service contracts, and database attribution. It is not only a Microsoft login button change.

## 2. Required Business Rules

### 2.1 Identity rules

1. The application has no local username/password authentication.
2. Customer contacts cannot sign in.
3. Internal users authenticate only through Microsoft Entra ID.
4. Internal account creation, disabling, MFA, Conditional Access, and role assignment are managed in Entra.
5. The application must not maintain an internal-user directory, internal-user password, or internal-user status.
6. The backend must authorize requests from validated Entra claims, not from database user or role rows.

### 2.2 Customer and contact rules

1. A customer is a `Company` record.
2. A company has zero or more `Contact` records.
3. Contacts are business records only; they have no login account.
4. `ADMIN` and `OPS` can:
   - Create companies.
   - View all companies.
   - Modify company details and status.
   - Create company contacts.
   - View company contacts.
   - Modify company contact details and status.
5. `SECURITY` cannot create or modify companies or contacts.
6. Do not introduce hard-delete behavior unless separately requested. Existing records should normally be deactivated or have their status changed so audit history remains valid.

### 2.3 Request and security rules

1. `ADMIN` and `OPS` can create visitor requests for a selected company.
2. `ADMIN` and `OPS` select an active company contact as the host/contact for a visitor request.
3. `ADMIN` and `OPS` can view, approve, reject, and cancel requests according to existing request-state rules.
4. `SECURITY` can access the security visitor workflow and perform check-in, check-out, and deny-entry actions.
5. `ADMIN` and `OPS` may retain read-only access to security visitor lists/details, matching the current behavior, but only `SECURITY` can perform security actions.
6. Every state-changing operation must record the Entra actor in immutable audit data.

## 3. Target Role and Permission Matrix

| Capability | ADMIN | OPS | SECURITY |
|---|---:|---:|---:|
| Sign in with Microsoft | Yes | Yes | Yes |
| View operations dashboard | Yes | Yes | No |
| View all companies/customers | Yes | Yes | No |
| Create company/customer | Yes | Yes | No |
| Modify company/customer details | Yes | Yes | No |
| Modify company/customer status | Yes | Yes | No |
| View company contacts | Yes | Yes | No |
| Create company contacts | Yes | Yes | No |
| Modify company contacts | Yes | Yes | No |
| Create visitor requests | Yes | Yes | No |
| View operational requests | Yes | Yes | No |
| Approve/reject/cancel requests | Yes | Yes | No |
| View security visitor list/details | Yes | Yes | Yes |
| Check in/check out/deny entry | No | No | Yes |
| View audit logs | Yes | Yes | No |
| Manage application users | No | No | No |

Entra administrators, outside this application, manage user assignments to these roles.

## 4. Current Architecture and Root Problem

The working tree contains a partial Entra implementation, but it still depends on application users:

- `backend/app/core/dependencies.py` validates an Entra token and then looks up a local `User` by `external_subject` or email.
- `require_roles()` reads `current_user.roles` from the database.
- `/auth/me` requires a database UUID.
- Entra login may mutate a matched database user, set `auth_provider="entra"`, and clear its password.
- Local login remains available to any database user with a valid password.
- Internal-user and customer-user creation still generate local passwords.
- Business and audit records store actor foreign keys to `users.id`.

This means the current behavior is Entra authentication combined with database identity and authorization. The target behavior is Entra authentication and Entra authorization with no database account.

The existing partial Entra work is uncommitted. Preserve unrelated changes, but refactor the partial authentication implementation rather than layering more database-user logic on top of it.

## 5. Target Architecture

```text
Internal employee
       |
       | Microsoft sign-in
       v
Microsoft Entra ID
  - authentication
  - MFA / Conditional Access
  - account lifecycle
  - ADMIN / OPS / SECURITY app-role assignment
       |
       | API access token
       v
FastAPI Entra token validator
       |
       | creates in-memory InternalPrincipal
       v
Role-based authorization policies
       |
       +--> Companies and contacts
       +--> Visitor requests and reviews
       +--> Security operations
       +--> Audit logs
       |
       v
PostgreSQL
  - companies
  - contacts
  - requests
  - visitor access records
  - audit logs
  - no login accounts
```

## 6. Entra Application Design

### 6.1 Recommended registrations

Use two Entra app registrations:

1. A Single Page Application registration for the React frontend.
2. A Web API registration for the FastAPI backend.

The API registration should:

- Expose a delegated scope such as `access_as_user`.
- Define app roles with values exactly matching the backend constants:
  - `ADMIN`
  - `OPS`
  - `SECURITY`
- Require user or group assignment on the enterprise application.

The SPA registration should be authorized to request the API scope.

### 6.2 Token requirements

The backend must accept only an Entra API access token that passes all required checks:

- RS256 signature validated against Entra JWKS.
- Exact allowed tenant.
- Exact allowed issuer.
- Exact API audience.
- Valid expiration and not-before timestamps.
- Expected token version where configured.
- Valid `tid` claim.
- Valid `oid` claim.
- Required delegated API scope.
- Allowed frontend client through `azp` or `appid`, when configured.
- At least one allowlisted app role from the `roles` claim.

Do not use email or UPN as the durable identity key. Use `(tid, oid)`.

Do not grant authorization from client-decoded claims. The backend validates the token and returns a normalized principal through `/auth/me`.

### 6.3 Entra administration

Entra administrators are responsible for:

- Creating and disabling employee accounts.
- Assigning users or groups to `ADMIN`, `OPS`, or `SECURITY`.
- MFA and Conditional Access policies.
- Access reviews and employee offboarding.
- Maintaining controlled emergency access accounts to prevent tenant/application lockout.

The application must not contain a local authentication backdoor.

## 7. Backend Identity and Authorization Design

### 7.1 In-memory principal

Create a non-ORM principal, for example:

```python
@dataclass(frozen=True)
class InternalPrincipal:
    provider: Literal["entra"]
    tenant_id: str
    object_id: str
    subject: str
    email: str | None
    display_name: str
    roles: frozenset[str]
```

Build `subject` as:

```text
entra:<tenant-id>:<object-id>
```

The principal must not be stored in a `users` table.

### 7.2 Authentication dependency

Replace `get_current_user()` with `get_current_principal()`.

`get_current_principal()` must:

1. Require an HTTP bearer token.
2. Validate it as an Entra API access token.
3. Require `tid` and `oid`.
4. Map only the allowlisted app roles.
5. Return `InternalPrincipal`.
6. Perform no database lookup.
7. Perform no database mutation or commit.

Use `HTTPBearer` or an equivalent bearer-token dependency. Do not continue using an OAuth password-flow dependency pointing at `/auth/token`, because the local password-token endpoint will not exist.

### 7.3 Role dependency

Refactor `require_roles()` to inspect `principal.roles`:

```text
require_roles("ADMIN", "OPS")
require_roles("SECURITY")
```

Frontend role gates remain a user-experience feature only. Backend dependencies remain authoritative.

### 7.4 Authentication API

Keep:

- `GET /api/v1/auth/me`

Remove:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/token`
- `POST /api/v1/auth/change-password`

The `/auth/me` response should no longer require a database UUID or password state. It should return:

```json
{
  "provider": "entra",
  "subject": "entra:<tenant-id>:<object-id>",
  "email": "employee@example.com",
  "full_name": "Employee Name",
  "roles": ["OPS"]
}
```

Do not expose `must_change_password`.

## 8. Target Database Model

### 8.1 Tables to retain

Retain these business tables:

- `companies`
- `contacts`
- `requests`
- `visitor_access_requests`
- `audit_logs`

Retain any other non-identity business tables required by the application.

### 8.2 Tables and identity relationships to remove

After attribution backfill and cutover, remove:

- `users`
- `roles`
- `user_roles`
- `company_users`
- `contacts.user_id`

Also remove account-only data and behavior:

- Password hashes.
- Password-change flags.
- Authentication-provider fields.
- External-subject fields on application users.
- Customer role assignments.
- Customer company-membership checks.
- Temporary-password generation.
- User activation/deactivation logic.

### 8.3 Company and contact relationship

The target relationship is:

```text
Company 1 ---- * Contact
```

A contact contains business information such as:

- Full name.
- Email.
- Phone.
- Job title.
- Contact type.
- Primary-contact flag.
- Status.

Remove contact response and form fields related to application accounts:

- `user_id`
- `user_account_status`
- `user_role`
- Login access.
- Temporary credentials.

### 8.4 Actor attribution

Removing application users must not destroy historical accountability. Store immutable actor snapshots instead of user foreign keys.

For audit records, use fields equivalent to:

- `actor_kind`: `ENTRA`, `LEGACY_LOCAL`, or `SYSTEM`.
- `actor_tenant_id`: nullable for legacy/system events.
- `actor_subject`: stable provider-qualified subject.
- `actor_email_snapshot`.
- `actor_name_snapshot`.
- `actor_roles_snapshot`: JSON/JSONB.

For a current internal action:

```text
actor_kind = ENTRA
actor_tenant_id = token.tid
actor_subject = entra:<tid>:<oid>
actor_email_snapshot = token email/preferred username when available
actor_name_snapshot = token display name
actor_roles_snapshot = validated application roles
```

These snapshots are audit evidence, not an employee directory or application account.

Do not create a replacement `internal_users`, `employees`, or mutable `actors` table.

### 8.5 Business entity attribution

Replace current user foreign keys with Entra attribution fields.

Companies:

- Replace `created_by_id` with creator tenant, subject, email snapshot, and name snapshot.
- Replace `updated_by_id` with updater tenant, subject, email snapshot, and name snapshot.

Requests:

- Replace `requested_by_id` with requester tenant, subject, email snapshot, and name snapshot.
- Replace `reviewed_by_id` with reviewer tenant, subject, email snapshot, and name snapshot.

Visitor access:

- Replace `checked_in_by_id` with check-in actor tenant, subject, and name snapshot.
- Replace `checked_out_by_id` with check-out actor tenant, subject, and name snapshot.
- Deny-entry actions must be attributable through the audit log and, if needed for direct reporting, equivalent actor columns.

A reusable SQLAlchemy mixin/value-object naming convention may be introduced, but avoid creating a mutable identity table.

## 9. Company and Contact API Requirements

### 9.1 Companies

`ADMIN` and `OPS` must be able to:

- `GET /api/v1/companies`
- `GET /api/v1/companies/{company_id}`
- `POST /api/v1/companies`
- `PATCH /api/v1/companies/{company_id}`

Creation and modification must record the current Entra principal in entity attribution and the audit log.

`SECURITY` must not be able to create or modify companies.

### 9.2 Contacts

`ADMIN` and `OPS` must be able to:

- `GET /api/v1/companies/{company_id}/contacts`
- `POST /api/v1/companies/{company_id}/contacts`
- `PATCH /api/v1/contacts/{contact_id}`

Contact creation and modification must record the current Entra principal in the audit log.

Remove customer-account behavior from contact services:

- Do not create a user when creating a contact.
- Do not link a contact to a user.
- Do not modify customer roles or account status from the contact update service.
- Do not return login-account status in contact responses.

### 9.3 Remove company-user endpoints

Remove:

- `GET /api/v1/companies/{company_id}/users`
- `POST /api/v1/companies/{company_id}/users`

Remove the associated company-user schemas and services.

## 10. Request Workflow Requirements

### 10.1 Request creation

Only `ADMIN` and `OPS` can create visitor requests.

When creating a request:

1. The internal user selects a company.
2. The backend confirms the company exists and is in an allowed status.
3. The internal user selects an active contact belonging to that company as the host/contact.
4. The backend validates the selected contact belongs to the selected company and is active.
5. The backend stores the selected contact information required by the request.
6. The backend stores the Entra requester snapshot.
7. The backend writes an audit log with the Entra actor snapshot.

Remove:

- Customer company-access checks.
- Customer ownership filtering.
- Logic that sets host name from the signed-in customer.
- Customer-role branches in request services and routers.

### 10.2 Request viewing and review

`ADMIN` and `OPS` can view operational requests and apply existing request filters.

`ADMIN` and `OPS` can approve, reject, or cancel according to the existing state-transition rules. Each action must store reviewer/actor snapshots and an audit event.

### 10.3 Historical customer-created requests

Existing requests may have been submitted by local customer users. Before removing `users`, preserve their attribution as:

```text
actor_kind = LEGACY_LOCAL
actor_subject = legacy-user:<old-user-uuid>
actor_email_snapshot = old user email
actor_name_snapshot = old user full name
```

Historical legacy identities cannot authenticate.

## 11. Security Workflow Requirements

- `ADMIN`, `OPS`, and `SECURITY` may view the security visitor list and details if current read behavior is retained.
- Only `SECURITY` can check in, check out, or deny entry.
- Security actions must store the current Entra principal snapshot.
- No security action may require a database `User` instance or `users.id`.

## 12. Audit Requirements

The audit log is the authoritative history of state-changing operations.

Every audit event must capture, at event time:

- Actor kind.
- Tenant ID where applicable.
- Stable subject.
- Email snapshot where available.
- Display-name snapshot.
- Validated application roles.
- Action.
- Entity type and ID.
- Summary.
- Relevant before/after metadata.
- Timestamp.

Audit rendering must use stored snapshots. It must not join to a current application user record for actor name or email.

Historical audit logs must remain readable after `users` is dropped.

## 13. Frontend Target

### 13.1 Login and session lifecycle

The login page must contain only Microsoft sign-in.

Remove:

- Email input.
- Password input.
- Local sign-in button.
- Default/demo credentials.
- Customer-login wording.
- Password-change page and routing.
- `must_change_password` behavior.

MSAL must own the token lifecycle:

- Initialize before protected application routes render.
- Process redirect results once.
- Restore the active account after reload.
- Acquire the API token silently before API requests.
- Handle interaction-required errors by starting an appropriate login flow.
- Use MSAL logout for sign-out.
- Do not duplicate the Entra access token in custom session storage.

The application may store non-secret display/session metadata, but MSAL remains the token source.

### 13.2 API client

Refactor the API client to obtain a current bearer token through an async token provider rather than receiving a static serialized `AuthState` token.

The API client must:

- Acquire an Entra API token silently.
- Attach it as a bearer token.
- Handle 401 as authentication/session expiration.
- Handle 403 as authorization denial without incorrectly logging out.
- Avoid infinite retry loops.

### 13.3 Routes and navigation

Target routes:

| Route | Roles |
|---|---|
| `/dashboard` | ADMIN, OPS |
| `/companies` | ADMIN, OPS |
| `/contacts` | ADMIN, OPS |
| `/visitor-request` | ADMIN, OPS |
| `/requests` | ADMIN, OPS |
| `/security` | SECURITY; optionally ADMIN/OPS read-only views |
| `/audit` | ADMIN, OPS |

Remove:

- `/change-password`
- `/customer-users`
- `/internal-users`
- Customer-only routes and navigation.
- Customer-role branches in default routing and navigation.
- Internal-user administration navigation and screens.

### 13.4 Contacts UI

Convert `Contacts & Users` to `Contacts`.

Keep:

- Company selector.
- Create contact.
- List contacts.
- Search and status filtering.
- Edit contact.

Remove:

- Create new user.
- Create user for existing contact.
- List users.
- Role filter.
- Login status column.
- Temporary-password card.
- Customer credential messages.

### 13.5 Request UI

The visitor-request page must assume an internal `ADMIN` or `OPS` principal:

- Show all eligible companies.
- Require company selection.
- Load active contacts for the selected company.
- Require a host/contact belonging to that company.
- Remove customer-role branches and customer-account warnings.

## 14. Code Removal and Refactoring Inventory

### 14.1 Backend

Remove or replace identity-dependent code in:

- `backend/app/core/dependencies.py`
- `backend/app/core/security.py`
- `backend/app/modules/auth/router.py`
- `backend/app/modules/auth/schemas.py`
- `backend/app/modules/users/`
- `backend/app/modules/companies/models.py`
- `backend/app/modules/companies/router.py`
- `backend/app/modules/companies/schemas.py`
- `backend/app/modules/companies/service.py`
- `backend/app/modules/contacts/models.py`
- `backend/app/modules/contacts/router.py`
- `backend/app/modules/contacts/schemas.py`
- `backend/app/modules/contacts/service.py`
- `backend/app/modules/requests/models.py`
- `backend/app/modules/requests/router.py`
- `backend/app/modules/requests/schemas.py`
- `backend/app/modules/requests/service.py`
- `backend/app/modules/security_portal/router.py`
- `backend/app/modules/security_portal/service.py`
- `backend/app/modules/visitor_access/models.py`
- `backend/app/modules/audit/models.py`
- `backend/app/modules/audit/router.py`
- `backend/app/modules/audit/schemas.py`
- `backend/app/modules/audit/service.py`
- `backend/app/modules/dashboard/router.py`
- `backend/app/modules/dashboard/service.py`
- `backend/app/scripts/seed_dev_data.py`
- `backend/app/shared/enums.py`
- `backend/app/main.py`

Review `backend/requirements.txt` after implementation. `passlib` and password-form dependencies may be removable when local authentication is gone.

### 14.2 Frontend

Remove or refactor identity-dependent code in:

- `frontend/src/App.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/auth/authStorage.ts`
- `frontend/src/auth/entra.ts`
- `frontend/src/auth/permissions.ts`
- `frontend/src/auth/RoleGate.tsx`
- `frontend/src/layout/Shell.tsx`
- `frontend/src/layout/navigation.ts`
- `frontend/src/pages/auth/LoginPage.tsx`
- `frontend/src/pages/auth/ChangePasswordPage.tsx`
- `frontend/src/pages/contacts-users/`
- `frontend/src/pages/internal-users/`
- `frontend/src/pages/visitor-request/VisitorRequestPage.tsx`
- `frontend/src/pages/dashboard/Dashboard.tsx`
- `frontend/src/types/api.ts`
- `frontend/src/constants/options.ts`

Retain `CredentialCard` only if it has another valid non-password use; otherwise remove it after confirming no remaining usages.

## 15. Database Migration Plan

Do not immediately drop `users`. Existing foreign keys and historical records depend on it.

### Phase 1: Backup and live-data inventory

Before any destructive migration:

1. Start/connect to the real PostgreSQL database.
2. Create and verify a restorable backup.
3. Count users, roles, role mappings, contacts, company users, requests, visitor records, and audit records.
4. Find every non-null reference to `users.id`.
5. Detect users with mixed internal/customer roles.
6. Detect users linked through `contacts.user_id` or `company_users`.
7. Detect missing/duplicate Entra subjects and case-insensitive duplicate emails.
8. Produce a reviewed mapping for historical internal accounts to Entra `(tid, oid)` where possible.
9. Assign `legacy-user:<uuid>` identities to unmapped or historical local users.

The migration must stop if the inventory cannot account for every referenced user.

### Phase 2: Additive actor schema

1. Add new nullable actor/snapshot columns to audit logs, companies, requests, and visitor access records.
2. Keep the old user foreign keys temporarily.
3. Add indexes needed for audit queries by actor subject.
4. Add the in-memory Entra principal.
5. Update state-changing services to write new actor snapshots.
6. During transition, dual-write old and new attribution only where an old user reference is still available. Do not create database users for new Entra principals merely to satisfy dual-write.

### Phase 3: Historical backfill

Before deleting any user:

1. Join each legacy actor FK to `users`.
2. Populate actor name and email snapshots.
3. Populate mapped Entra tenant/object identity where known.
4. Otherwise populate a `LEGACY_LOCAL` subject.
5. Backfill company creator/updater attribution.
6. Backfill request creator/reviewer attribution.
7. Backfill check-in/check-out attribution.
8. Backfill audit actor attribution.
9. Verify every non-null old actor FK has a complete replacement.

Unresolved attribution must block the destructive migration.

### Phase 4: Entra-only application cutover

1. Configure API scope and app roles in Entra.
2. Assign test users for all three roles.
3. Deploy Entra-only backend authentication and authorization.
4. Deploy the Microsoft-only frontend.
5. Disable/remove local auth endpoints.
6. Remove customer and internal user-management UI.
7. Verify that new company, contact, request, review, and security actions produce Entra actor snapshots.
8. Run a soak period before destructive database removal.

### Phase 5: Remove legacy identity structures

After the cutover and backfill are verified:

1. Drop `company_users`.
2. Remove the `contacts.user_id` foreign key, constraint, and column.
3. Remove old user FKs from companies, requests, visitor access, and audit logs.
4. Drop obsolete old actor-ID columns.
5. Drop `user_roles`.
6. Drop `roles`.
7. Drop `users`.
8. Remove ORM models and imports.
9. Remove user/role seed data.
10. Add non-null/check constraints for required new actor snapshots where historical data permits.

Treat this phase as irreversible without the verified backup. An Alembic downgrade cannot recreate deleted identity or password data.

## 16. Implementation Work Packages

Implement in this order. Each work package should have tests before destructive follow-up work begins.

### Work Package 1: Entra principal and token validation

- Implement strict Entra token validation.
- Add `InternalPrincipal`.
- Refactor role dependencies.
- Refactor `/auth/me`.
- Add authentication and authorization tests.

### Work Package 2: Actor attribution schema

- Add additive actor columns.
- Introduce actor-snapshot helpers.
- Update audit writing and reading.
- Update company, request, review, and security services.
- Add migration and service tests.

### Work Package 3: Remove customer access behavior

- Remove local auth endpoints and password code.
- Remove customer roles and customer dashboard behavior.
- Remove `company_users` services/endpoints.
- Remove contact-to-user behavior.
- Make request creation internal-only.
- Add API permission tests.

### Work Package 4: Frontend Entra-only session

- Implement MSAL-owned token lifecycle.
- Replace the static-token API client.
- Remove local login/password flows.
- Remove customer and internal user screens.
- Simplify company/contact/request screens.
- Add route and component tests where the project test setup allows.

### Work Package 5: Backfill and destructive migration

- Run live-data inventory.
- Backfill actor snapshots.
- Validate counts and unresolved-reference queries.
- Drop identity relationships and tables.
- Verify audit history and business data.

### Work Package 6: Documentation and operational readiness

- Update README and deployment configuration.
- Document Entra registrations, scope, role assignments, and redirect URIs.
- Document role-permission behavior.
- Document backup, migration, rollback, and emergency-access procedures.
- Remove all demo credentials from documentation and UI.

## 17. Test Plan

### 17.1 Token validation

Test that:

- A valid assigned Entra user succeeds without a database user row.
- A token with the wrong tenant fails.
- A token with the wrong issuer fails.
- A token with the wrong audience fails.
- A token with a missing/incorrect API scope fails.
- A token from a disallowed client fails where client validation is enabled.
- A token without `tid` fails.
- A token without `oid` fails.
- An expired or not-yet-valid token fails.
- A token with no allowed app role receives 403.
- Unknown app roles do not grant permissions.

### 17.2 Role permissions

Test the full permission matrix, especially:

- `ADMIN` can create and modify companies and contacts.
- `OPS` can create and modify companies and contacts.
- `SECURITY` cannot create or modify companies or contacts.
- `ADMIN` and `OPS` can create visitor requests.
- `SECURITY` cannot create visitor requests.
- Only `SECURITY` can check in, check out, or deny entry.
- No role can access removed user-management endpoints.

### 17.3 Company and contact behavior

Test that:

- Company creation records an Entra actor snapshot.
- Company modification records before/after audit metadata and the Entra actor.
- Contact creation requires a valid company.
- Contact modification records before/after audit metadata and the Entra actor.
- Contact responses contain no login-account fields.
- No contact operation creates or modifies a user account.

### 17.4 Request behavior

Test that:

- Request creation requires an allowed company and active contact belonging to that company.
- A contact from another company is rejected.
- An inactive contact is rejected.
- The requester Entra snapshot is stored.
- Review and cancellation actions store actor snapshots.
- Existing request-state validation still applies.

### 17.5 Security behavior

Test that:

- Security actions require `SECURITY`.
- Check-in/check-out actor snapshots are stored.
- Audit events are written for all security actions.
- Existing date, status, and identity-verification rules remain enforced.

### 17.6 Migration integrity

Before dropping identity tables, assert that:

- Every legacy company actor reference has a replacement snapshot.
- Every legacy request actor reference has a replacement snapshot.
- Every legacy visitor actor reference has a replacement snapshot.
- Every legacy audit actor reference has a replacement snapshot.
- Historical customer-created requests retain `LEGACY_LOCAL` attribution.
- Dropping identity tables does not delete companies, contacts, requests, visitors, or audit logs.
- Record counts before and after the destructive migration match expected transformations.

### 17.7 Frontend

Test that:

- The application shows only Microsoft sign-in.
- Reload restores an Entra session.
- Silent token renewal works.
- Logout clears the MSAL session.
- A 401 initiates the correct authentication recovery.
- A 403 displays an authorization error without a retry loop.
- Navigation matches the role matrix.
- `ADMIN` and `OPS` can access company and contact editing.
- `SECURITY` cannot access company/contact editing routes.
- Customer-user and internal-user screens no longer exist.

## 18. Acceptance Criteria

The restructure is complete only when all of the following are verified:

1. A newly assigned Entra employee can sign in without any database user row.
2. Removing or disabling the employee in Entra prevents future access.
3. Changing an Entra app-role assignment changes application permissions without a database change.
4. There is no local login, password reset, or password-change path.
5. There is no customer login path.
6. There is no internal-user or customer-user management screen.
7. `ADMIN` and `OPS` can create and modify company/customer details.
8. `ADMIN` and `OPS` can create and modify company contacts.
9. `SECURITY` cannot modify companies or contacts.
10. `ADMIN` and `OPS` can create visitor requests using a selected active company contact.
11. Security actions are restricted to `SECURITY`.
12. New audit events include stable Entra actor identity and immutable display snapshots.
13. Historical audit and business attribution remains readable after legacy users are removed.
14. `company_users`, `user_roles`, `roles`, and `users` are absent after the final migration.
15. `contacts.user_id` and all login-account fields are absent.
16. Backend tests, frontend build, frontend lint, and migration verification pass.
17. No credentials, client secrets, access tokens, or passwords are committed to the repository.

## 19. Rollout and Rollback Controls

1. Take and verify a restorable database backup before the first destructive migration.
2. Deploy additive schema changes before removing any old columns or tables.
3. Test all three Entra roles in the target environment before disabling local authentication.
4. Keep the destructive migration separate from the authentication cutover so the application can be rolled back during the soak period.
5. During the soak period, rollback may restore the prior application while additive columns remain unused.
6. After `users` and related identity tables are dropped, rollback requires restoring the database backup; an Alembic downgrade is insufficient.
7. Log authentication failures without logging bearer tokens or sensitive claims.

## 20. Current Verification and Known Blocker

During planning:

- The frontend production build passed.
- Frontend lint completed with existing React hook dependency warnings.
- Backend Python compilation passed.
- Backend dependency validation passed.
- Database models and all Alembic migrations were inspected.

Live database row contents were not inspected because Docker Desktop/PostgreSQL was not running and the configured hostname `postgres` is resolvable only inside the Compose network. The implementing agent must complete Phase 1 live-data inventory before writing or running the destructive migration.

## 21. Instructions to the Implementing Agent

1. Preserve unrelated uncommitted work in the repository.
2. Inspect current files and the working-tree diff before editing.
3. Do not delete user rows or identity tables before completing actor backfill and verification.
4. Use test-driven implementation for authentication, authorization, and migration behavior.
5. Keep each work package independently testable.
6. Do not invent a replacement internal-user table.
7. Do not keep local authentication as a fallback.
8. Do not authorize by email, frontend-decoded claims, or database roles.
9. Use Entra `(tid, oid)` as the stable internal identity.
10. Preserve historical customer and internal attribution using immutable snapshots.
11. Verify every acceptance criterion before declaring the restructure complete.
