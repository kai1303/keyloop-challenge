# Availability from the public bookings snapshot

**Goal:** Calculate guest time choices from the same monthly response used by the calendar.

**Approved design:** Extend `GET /bookings?month=YYYY-MM` to return `{month, bookings, technicians, bays}`. Include only times, service labels, service qualifications, and response-local resource aliases. Never expose actual user/bay/booking IDs, names, contact data, vehicles, or credentials. Include intervals overlapping the month's timezone boundaries. Read resources and bookings in one REPEATABLE READ transaction to avoid inconsistent aliases or capacity during concurrent changes.

The calendar hook owns the monthly fetch and Realtime subscriptions. The form derives resource bitmaps from this snapshot and opening hours; opening a form or switching service makes no availability request. Fail closed on snapshot errors, retain user choices/details on refresh, and preserve uncertain idempotent retries. POST remains authoritative: resource locks and post-lock availability checks stay unchanged. Keep existing availability endpoints for the standalone monitor and other callers.

**Scope:** API booking types/service and HTTP/integration fixtures; web calendar hook, form, pure slot calculation and tests; current API/web/architecture documentation. No migrations, dependencies, seed changes, or unrelated dirty work.

- [x] Add failing tests for resource capacity, qualifications, full-interval conflicts, month overlap, privacy, and one shared browser fetch.
- [x] Implement the anonymous consistent snapshot and frontend bitmap derivation; remove guest availability/preflight requests.
- [x] Update affected fixtures/docs and verify web, API, and disposable PostgreSQL tests.
- [x] Reload the live page; compare frontend choices against backend availability, inspect request counts, and save visible proof.

Execute inline in the existing dirty workspace; preserve previous work. No commits or deployment requested.

**Verification:** Web 188 passed / 3 skipped; API unit 119 passed; HTTP 72 passed; guarded PostgreSQL integration 76 passed. Both builds, API typecheck/lint passed. Frontend calculation matched backend availability for both services across five local dates. Live service switching issued no HTTP request; one date-only Broadcast caused exactly one monthly refresh. Existing business rows were not changed by this refactor.
