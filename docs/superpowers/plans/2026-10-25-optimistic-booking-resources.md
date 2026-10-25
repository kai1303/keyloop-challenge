# Optimistic booking resources implementation plan

**Goal:** Use optimistic version checks for every booking write, without restoring resource_slots or changing the HTTP contract.

**Architecture:** Add scheduling_version counters to public.users and public.service_bays. Read resource versions without explicit locks, then conditionally increment each observed version in a deterministic order. Zero updated rows abort the transaction and enter the existing three-attempt retry loop. Recheck exact-pair availability after successful claims so a stale initial preview cannot permit overlap. Keep booking expectedVersion checks and transactional idempotency.

**Scope:** Booking create, reschedule (old/new resource union), cancellation and status changes; both migration lists; disposable integration fixtures; unit/concurrency/migration checks; current architecture diagrams and setup documentation. PostgreSQL still takes normal row locks while executing conditional UPDATEs. Per-resource versions can conflict across different hours or dates. All booking writers must follow this protocol. Inventory/auth concurrency is outside this booking refactor.

- [x] Add resource CAS failure/order tests and observe failure against explicit row locks.
- [x] Add a forward migration with NOT NULL integer counters defaulting to zero, registered in both data sources and test fixtures. Preserve existing records and historical migrations.
- [x] Replace lockResources with claimResources and update create/reschedule/status callers and unit fixtures. Keep exact-pair rechecks, bounded retries, and rollback semantics.
- [x] Prove a stale CAS fails without losing the winner's increment; prove both resource claims roll back together; retain real races, cancellation, rescheduling, legacy intervals and idempotency coverage. Update test barriers to coordinate on conditional writes.
- [x] Run API unit/HTTP/PostgreSQL suites, API lint/build/typecheck, and frontend checks. Apply the migration locally with old API writers stopped; restart and verify access/availability without creating demo bookings.
- [x] Update architecture text and diagram labels, keeping old reports/plans explicitly historical. Record final verification and remaining limitations.

Verified on 25 October 2026: API unit 117, HTTP 78, PostgreSQL integration 82,
web 187 (3 skipped), API typecheck/lint/build, web build, and local API reads.
The local migration preserved canonical hashes for 12 users, 2 bays, and 2
bookings. Ordinary PostgreSQL row locks still occur during conditional updates;
shared-resource contention across hours/dates can exhaust three retries and
return 503. Direct SQL writers outside this protocol can violate allocation
safety. Production load and telemetry were not verified.

Work inline in the current checkout, preserving existing pending UI/documentation edits. No new dependencies, cache, service, commit, or push is required.
