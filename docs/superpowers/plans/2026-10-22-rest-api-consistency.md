# REST API consistency implementation plan

**Goal:** Apply the five approved API review fixes without widening guest access.

**Architecture:** Public `GET /bookings?month=YYYY-MM` returns the existing sanitized calendar shape; public `POST /bookings` returns the existing confirmation. Staff use `/admin/bookings`, including item GET/PATCH. Creation advertises the guarded staff item URL in `Location`; there is no public customer-detail lookup. A private PostgreSQL idempotency table stores a request fingerprint and confirmation in the same transaction as booking creation. Lead pages use a timestamp/UUID cursor and a bounded limit.

**Tech stack:** Existing NestJS, PostgreSQL/TypeORM, Supabase Data API, React and Vitest. No new dependencies. Existing dirty work is preserved in place.

## 1. Booking routes and retrieval

- [x] Add failing HTTP tests for public `/bookings`, staff item GET/PATCH, `Location`, UUID validation, and access restrictions.
- [x] Rename public booking routes and update Vite's guest allowlist, frontend calls, tests, and the maintained live verification script.
- [x] Add guarded single-booking retrieval and creation `Location` headers. Retain status subresources and expected-version checks.

## 2. Durable creation retries

- [x] Add failing disposable-database tests for concurrent identical keys, payload conflicts, failed-operation rollback, independent scopes, and service recreation.
- [x] Add an additive private-schema migration to both migration streams and test fixtures. Insert the idempotency row before allocation so concurrent retries wait on the same unique key; save the confirmation before committing. Reject mismatched fingerprints with 409.
- [x] Require UUID `Idempotency-Key` on HTTP creation. Scope guest keys separately from each staff identity. Frontend attempts retain the same key for unchanged failed submissions, and use a new key when the payload changes or a new successful operation starts.
- [x] Test guest retry behavior after an uncertain response, including the case where availability is now full.

## 3. Lead pagination

- [x] Add failing service tests for stable timestamp/UUID traversal, next-cursor metadata, bounded limits, and malformed cursor rejection.
- [x] Return `{ leads, nextCursor }` with default 50 and maximum 100 records. Apply ordering and filters before the limit through the existing Data API adapter.
- [x] Update frontend types, fixtures and HTTP/database tests; add an accessible Load more button that retains earlier rows and selection on failure/retry.

## 4. Documentation and verification

- [x] Update active API/frontend/root docs and architecture references. Preserve historical reports and plans as historical evidence.
- [x] Run API unit/HTTP tests, the disposable PostgreSQL integration suite, frontend tests, typechecks/builds and scoped lint.
- [x] Review the exact delta against the saved pre-task workspace snapshot, check documentation links, and report any deployment/migration boundary honestly.

The shared demo database is not reset. The new migration must be applied before running the changed HTTP API against that database. Test resets target only the fixture guarded to local port 54329 and database `scheduler_test`.

Final review found one additional recovery edge: a lost confirmation can arrive after the submitted start has passed. A failing clock-crossing regression test now verifies that the guest form retains its submitted time across clock changes and availability refreshes. The fix and test received a second read-only review with no remaining findings.

The local shared demo migration was applied after confirming it was the only pending migration. Existing booking/customer/resource and lead hashes were unchanged. A real Supabase Data API traversal covered 1,005 owned records over 11 pages, including equal timestamps and microsecond differences; owned fixtures were removed and original hashes restored. A temporary full-API process verified canonical routes, private-item protection, old-route removal, and missing-key rejection, then stopped.
