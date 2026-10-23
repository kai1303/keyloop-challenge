# Booking resource locks implementation plan

The user approved keeping appointment occupancy only in service_bookings and replacing resource_slots with locks on existing users/service_bays rows.

**Goal:** Remove duplicate occupancy storage while preserving safe concurrent booking, history, versions, idempotency, authorization and Realtime behavior.

**Architecture:** READ COMMITTED transactions select a candidate, lock the union of previous/next technician IDs in sorted order followed by bay IDs in sorted order, and recheck the exact selected pair using fresh booking reads. Retry allocation when the candidate changed. Status changes lock the existing resources. Booking-version conditional updates still prevent stale edits. Availability remains an unlocked bitmap derived from service_bookings; hourly rules remain unchanged. All booking writers must use this protocol. Different hours/dates for the same resource now serialize.

**Tech stack:** NestJS, TypeORM, PostgreSQL row locks, Vitest, existing Supabase Realtime triggers. No new dependency or GiST index.

- [x] Write failing tests for real resource-row waits, revalidation, resource serialization, no resource_slots, competing creation/rescheduling/cancellation and stable cross-resource ordering.
- [x] Replace slot-claims.ts with resource-locks.ts and update create/reschedule/status operations. Keep bounded transaction retries/timeouts and booking expectedVersion checks.
- [x] Add a forward migration dropping only public.resource_slots without CASCADE, register it in both migration streams/fixtures, and test preservation/rollback. Do not rewrite historical migrations.
- [x] Update current fixtures, historical upgrade tests, live verification script, privacy assertions and current documentation/diagram labels; retain historical evidence with a superseded notice.
- [x] Run API unit/HTTP/PostgreSQL tests, typecheck/lint/build and web checks. Review concurrency paths before cutover.
- [x] Retain checksummed private backups, restore and rehearse migration in disposable PostgreSQL, pause local booking writers, apply the pending migration locally, verify remaining rows/auth/API/Realtime/privacy, remove task-created temporary resources and save sanitized evidence. No production deployment.

Recovery requires the pre-cutover source plus verified backup (or a deliberate re-backfill of historical claims) with all writers stopped. Old binaries must not run after this migration; direct SQL writes bypass application locking.

Verification: 119 API unit, 72 HTTP and 75 PostgreSQL tests passed; API build/typecheck/lint and web build/typecheck passed. Review found and fixed a cross-midnight legacy occupancy lookup regression. Fresh setup applied 12 migrations; local upgrade retained all remaining table rows/OIDs. Live HTTP races, auth/privacy and Realtime passed. See exports/booking-resource-locks-checks.json for the evidence boundary.
