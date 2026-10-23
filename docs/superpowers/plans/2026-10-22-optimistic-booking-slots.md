# Optimistic Booking Slots Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the backend implementation, then separate spec and quality review. Follow verification-before-completion.

**Goal:** Replace explicit pessimistic row locks with optimistic per-resource/per-hour claims, preserving all booking behavior and existing data.

**Architecture:** The approved design uses a resource/date/hour version and occupied/free state. Read a version without FOR UPDATE, then conditionally write WHERE version = observedVersion; zero updated rows cause transaction rollback/reselection. Technician and bay claims and the appointment persist atomically. Booking edits use UPDATE ... WHERE version = expectedVersion RETURNING instead of SELECT FOR UPDATE. Ordinary PostgreSQL write locking is unavoidable and is not an explicit pessimistic allocation protocol.

**Tech Stack:** Existing NestJS, TypeORM, PostgreSQL, Luxon, Vitest; unchanged React/Supabase interfaces.

## Scope and invariants
- Current managed worktree: /Users/kai/.codex/worktrees/appointment-booking/keyloop-interview. Reuse it and preserve unrelated changes. Main admin checkout and its login changes remain untouched.
- Slot identity includes resource plus absolute instant of a dealership-local hour (equivalent to resource/date/hour while handling offsets). Resource references must be valid, slots unique, version checks atomic.
- Keep the current daily bitmap matcher for eligibility and previews. Claim rows coordinate writes, with bookings still authoritative.
- All create, reschedule and cancellation paths must maintain claim state in the same transaction. Completion/in-service retain occupancy. Retain stale-edit 409 behavior and bounded contention retries.
- Remove all explicit FOR UPDATE/FOR SHARE/advisory locks from booking runtime, not just allocation.
- Migration must preserve existing timestamps, contacts, associations and versions. Backfill every hour touched by historical off-grid intervals. Two adjacent historical off-grid appointments may share a conservative hourly slot: preserve both and don't free that slot until the remaining appointment is released. Handle this explicitly.
- Migration runs with booking API stopped, with a before/after data hash. New slots must initialize safely under concurrent insertion. Failed bay claim/insertion must roll back technician claims. Moving a booking must preserve old claims when the move fails.
- No new authentication/UI/idempotency/backup work. Keep current API contracts and date-only Broadcast behavior.

## Task 1: Backend and database conversion
Files: apps/api/src/bookings/bookings.service.ts; a focused slot-claims helper; new additive database migration; data-source.ts; supabase-data-source.ts; test/database-fixture.ts; existing service/migration/admin/concurrency tests; API README and live E2E harnesses.
- [x] Write regression tests and demonstrate failure: no explicit pessimistic SQL, conditional slot-version conflict, concurrent create collisions, different hours/dates independent, duplicate first slot initialization, stale admin CAS, rollback/release/reschedule, legacy shared-hour backfill.
- [x] Implement schema/backfill and register it in core/Supabase/test migration lists. Existing fixture truncation/cleanup must include or consistently reset claim state.
- [x] Implement conditional claims and admin CAS; all conflict paths roll back and retain existing HTTP semantics.
- [x] Update tests that currently force technician/bay FOR UPDATE barriers to coordinate on slots or synchronized reads instead. Prove real overlap and that an in-flight slot update cannot block another hour/date of the same technician and bay.
- [x] Run test, test:e2e, test:integration, typecheck, lint, build. Update documentation and the repeatable live harness to use the new protocol.

## Task 2: Review
- [x] Independent spec compliance review of Task 1, followed by independent code quality/concurrency review. Fix material findings and rerun checks.

## Task 3: Local migration and end-to-end proof
- [x] Preserve app database snapshot, stop only appointment API, apply additive migration and verify unchanged original bookings, then restart.
- [x] Run real PostgreSQL/HTTP competing requests, matching, unrelated-slot independence, stale edits, cancel/rebook and reschedule conflicts. Verify guest/admin Realtime still receives date-only changes.
- [x] Clean only test fixtures and reconcile/remove their claim rows safely. Verify original data hash unchanged and report actual outcomes and limits.

Do not commit mixed untracked starter files or unrelated work. Root owns actual app DB migration, service restart and browser verification; implementer operates on disposable scheduler_test only.

Current runtime: main apps/api on3006 and local55322/postgres own the consolidated booking API with staff auth. Port only booking core/migration/tests from isolated worktree and preserve auth modules/controllers and migrations0004/0005. The older54322 stack was restarted for inspection and stopped again without data changes.
