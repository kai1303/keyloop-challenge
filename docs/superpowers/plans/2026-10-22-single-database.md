# Single Supabase Database Implementation Plan

**Goal:** Run inventory, leads, and appointments in the existing
`keyloop-inventory-local` Supabase project, preserving every application record.

**Architecture:** Retain public inventory/lead tables and import the private
scheduler schema plus its TypeORM migration history. Existing schema-qualified
queries need no changes. Keep inventory Postgres Changes and appointment date-only
Broadcast on this one project. Do not expose scheduler through the Data API.

**Tech Stack:** Supabase CLI, PostgreSQL 17 pg_dump/pg_restore, existing NestJS
TypeORM migrations, existing React Supabase clients.

## Scope and execution

- [x] Inspect schemas, grants, migration histories, table counts, source/target
  configuration and active API writer. Destination has no scheduler schema or
  appointment migration history. Both auth user stores are empty.
- [x] Briefly stop the main API writer. Save private timestamped full logical
  dumps for both databases and env/config backups. Record SHA-256 checksums and
  per-table sorted-row hashes without publishing rows or credentials.
- [x] Restore application schemas from both backups into a separate disposable
  verification database. Verify identical rows, keys, versions, times, grants,
  indexes, booking trigger, migration histories, and coexistence of both vehicle
  tables. Use a realtime.send test stub only in that isolated database.
- [x] Import only scheduler objects and the appointment migration table/sequence
  into the destination in one transaction, with exit-on-error and an empty-target
  guard. Recheck all application table hashes. Never restore platform-owned auth,
  realtime, storage, or project roles into the retained destination.
- [x] Point server SQL and both booking browser clients to the retained project;
  use its browser-safe publishable key. Retain compatibility variable names and
  existing inventory/lead configuration. Restart the main API and Vite.
- [x] Verify HTTP reads and access boundaries, and actual WebSocket date-only
  Broadcast plus inventory Postgres Changes on the retained project. Use rolled
  back transactions for constraint checks and reversible no-op updates for live
  Realtime verification; compare record hashes afterward.
- [x] Replace two-project run instructions/env examples with one-project setup,
  update architecture diagrams, retain a migration/rollback runbook and ignored
  private backups. Keep the old scheduler volume recoverable and stop its stack
  only after successful verification. Do not reset any demo database.
- [x] Run relevant PostgreSQL integration, API/frontend regressions, builds, and
  type checks. Save sanitized verification evidence and report limits explicitly.

## Rollback

Before accepting new writes, restore the previous API/frontend env backups and
restart against the retained original scheduler stack. After new writes reach the
merged database, do not blindly switch back: export/reconcile the new scheduler
state first. Backups are private owner artifacts and must not be committed.


## Results

All 12 original application/history tables matched in the isolated restore
rehearsal and after import. Final comparison retained every business row and the
original migration records; the new permission migration alone added one history
row. The restore database was removed afterward; original volumes and private
checksummed dumps remain. Both WebSocket paths delivered actual events from the
shared project. Staff/guest browser pages loaded after the old stack stopped.

API: 107 unit, 65 HTTP, 40 PostgreSQL integration tests passed. Frontend: 158
passed, 3 existing tests skipped. API/frontend builds, API typecheck/lint,
read-only shared-schema SQL, and both rolled-back inventory SQL checks passed.
Scoped review found one rollback network-binding issue, fixed by specifying a
separate loopback-bound network. Diagram render visually inspected.

Fresh-machine Supabase provisioning and full platform disaster recovery were not
rerun. The application restore rehearsal and live local cutover are verified.
See `docs/database-merge.md` and `exports/shared-database-checks.json`.
