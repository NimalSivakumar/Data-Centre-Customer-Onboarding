# Application change and release register

This is the Data Centre Customer Onboarding **application**, not an MVP. The repository directory name is retained to avoid breaking existing paths. A name change is not a production-readiness certificate.

## Scope and starting point

Base revision: `2082c1be278d7eab706b1f2f6f4ce0dd8bda1afa`.

Substantial uncommitted backend/frontend fixes already existed when this follow-up began. They were preserved, not reset or claimed as freshly authored. A credential-excluding source backup and starting diff were captured outside the repository before further changes. The starting execution baseline was 144 passing backend tests and 90 frontend tests, of which 86 passed and four failed. The frontend production build passed; two lint warnings remained.

No install, migration, real database write, Entra/VM call, deployment, commit or push is authorized by this document. Such operations require separate approval.

## Technical change list

| Area | Work / acceptance requirement | State |
|---|---|---|
| Company/contact editing | Keep each edit draft bound to its target; prevent switching targets or double writes while saving | Preserved and included in passing integrated tests; final focused review passed with no confirmed blocker |
| Company/request pages | Consume server pagination and totals; keep filters mounted; do not discard rows on unchanged clear | Pagination/focus/loading-state regressions corrected; integrated tests pass |
| Contact/company selectors | Retrieve the complete company directory, reject partial pagination, ignore stale reads | Existing helpers preserved; visitor-page integration verified with 125-company test |
| Action errors | Show mutation errors; distinguish failed writes from successful writes followed by failed refresh | Preserved and included in passing integrated tests; final focused review passed with no confirmed blocker |
| Visitor request review | Lock draft while reviewing/sending; require current loaded host; prevent stale contact responses; guard repeated submission | Seven targeted mounted UI tests pass locally, including late-directory rejection |
| Visitor form clarity | Persistent labels and readable JSX rather than a single compressed return line | Targeted label test passes locally |
| API deadlines | Bound token/fetch/body work, preserve real session headers, never automatically retry business writes | Independent API spot-check found no significant issue; integrated tests pass |
| Bootstrap/dashboard | Bounded fail-closed startup with safe diagnosis; dashboard errors stop loading and offer retry | Implemented; included in passing integrated tests |
| Dialog/drawer keyboard behavior | Initial focus, Tab containment, Escape/busy rules, focus restoration and closed-drawer isolation | Implemented; included in passing integrated tests |
| Boundary validation | Bounded derived title; local-time schedule validation; PATCH omission versus null; normalized strings/legacy host compatibility | Independent backend review found no high/medium regression; final 150-test backend suite passes |
| Token/session hardening | Required valid expiry; deterministic worker lifecycle; refresh/lock rows before audit diffs | Preserved and reviewed; pending-stop worker startup now fails explicitly; regression test passes |
| Product wording | Operational application default name and current README/Docker/CI examples | Default-name RED/GREEN test passes; historical source paths are not renamed |
| Confirmed visitor policy | ADMIN approval then SECURITY identity-verified entry; manual exit; retained no-show/expiry history | Five new characterization tests pass; existing policy preserved |

## Owner clarification preserved

- ADMIN approval precedes entry. Security checks identity and explicitly records Check in.
- Check in records that Security accepted the visitor; no extra approval status was introduced.
- Security explicitly records Check out when the visitor leaves.
- Approved pending visitors from a past site date become NO_SHOW; eligible requests become EXPIRED. History is retained. The date boundary is site midnight; the background sweep normally runs every 60 seconds while the backend is running, and catches up after downtime.
- A checked-in person is not silently checked out at midnight.
- Cancelled requests must not allow new entry. The handling of cancellation while someone is already inside remains an explicit owner decision; this follow-up does not silently change cancellation/visibility rules.
- The owner did not choose a new definition for recently_checked_out. Its current query remains an all-time CHECKED_OUT count. Do not describe it as today's exits. The earlier Obsidian Dashboard Count Semantics note contains that incorrect date-filter statement; vault synchronization requires a separate deliberate update after final source stabilization.

## Release gates — not completed by local unit tests

- [ ] Approve final diff, including all preexisting uncommitted work; commit only with owner approval.
- [x] Execute complete backend/frontend checks against the current integrated source and record exact runtimes/results below.
- [ ] Run matching CI/runtime-lane checks; local Node/Python versions are not the configured CI versions.
- [ ] Approve the cancellation-while-checked-in operating policy and test discoverability/exit behavior.
- [ ] Decide whether to change the checkout metric; current all-time behavior remains unchanged.
- [ ] Approve any normalized-uniqueness/optimistic-edit schema changes; do not rewrite historical migrations or clean data silently.
- [ ] Validate PostgreSQL persistence, rollback and concurrent staff sessions on an approved disposable database.
- [ ] Validate Entra/browser sign-in, role combinations, idle/logout/offline behavior and operational UI in the authorized environment.
- [ ] Validate VM migration revision and coordinated frontend/backend compatibility; a source Alembic head is not a live database check.
- [ ] Agree release preflight/quiescence, trusted TLS, non-shallow readiness, backup and recovery procedures before deployment. Existing release-copy scripts are not made atomic by frontend fixes.
- [ ] Synchronize affected knowledge-vault notes, evidence labels and source mappings to the final reviewed revision.

## Verification record

Local integrated verification on 2026-11-03: **150 backend tests passed; 123 frontend tests passed; frontend lint passed with zero warnings; TypeScript/Vite production build passed; backend import passed with 33 routes; source Alembic head remains 202610290023; git diff --check passed.** No source changed during that verification snapshot. Final independent focused review passed: no confirmed security/logic blocker in the inspected changes; 56 focused tests passed independently. This is not whole-application or live-release certification.

Execution used the existing Python 3.14.0 virtual environment and Node 24.15.0 in an isolated credential-free source copy with synthetic settings. CI declares Python 3.12 and Node 22; remote CI and target-environment integration have not been run. Existing FastAPI/Python deprecation warnings and the large JavaScript bundle warning remain; they are not lint/type/test errors.

The application default title and current local/Docker/CI examples now use Data Centre Customer Onboarding. A separately configured APP_NAME on the VM can still override the default; real environment files were not edited. New local check results do not establish deployment, database migrations, browser/Entra acceptance, recovery or an error-free application.
