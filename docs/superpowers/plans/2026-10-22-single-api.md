# Single NestJS API Implementation Plan

**Goal:** Run Inventory, Leads, Documents, and guest/admin Appointments in one
NestJS application from the main workspace.

**Architecture:** Move the existing appointment source, migrations, seed, and tests
into the main API and register a focused `BookingsModule`. Retain its TypeORM
transaction/locking protocol, validated DTOs, admin guard, and date-only Broadcast.
Keep the inventory/leads Supabase client and scheduler SQL connection distinct;
this change moves application code, not database records. All frontend proxies
default to the same API origin while retaining the staff key/public allowlist.

## Change surface and verification

- [x] Reuse appointment `src/bookings/`, `src/database/`, `configure-app.ts`, HTTP
  and integration tests, the disposable test Compose fixture, required package
  dependencies, SQL build assets, migration/seed/test scripts, and env examples.
  Preserve the original appointment worktree and unrelated dirty work.
- [x] Add a root-AppModule HTTP regression test that overrides database/services,
  then verifies inventory/leads/documents and guest/admin booking routes in the
  same app, including input validation and the admin key. Observe missing booking
  routes before registering the module.
- [x] Register `BookingsModule`, configure validation and shutdown in bootstrap,
  and adapt the starter root test so ordinary tests need no database. Scheduler
  startup requires explicit DATABASE_URL/timezone/hours; configured connection
  failures fail startup rather than serving an apparently healthy booking API.
- [x] Add a proxy regression check for one default API origin, then make guest
  and staff booking proxies fall back to the main origin. Preserve separate-path
  credential boundaries and existing override compatibility.
- [x] Run API unit/HTTP tests, build, typecheck, lint, and real PostgreSQL booking
  integration tests against the existing dedicated scheduler_test fixture.
  Run frontend regressions for proxy/default-origin changes.
- [x] Update READMEs and architecture diagrams for one API process and migrations
  owned by this workspace. Clearly retain the current two-project database
  topology and identify shared database consolidation as a target design.
- [x] Verify all four APIs through one live process and guest/staff browser paths;
  keep live data intact, obtain a scoped code review, and record the evidence boundary.

## Verification evidence

- Red/green: unified AppModule initially returned 404 for guest/staff booking
  routes; registering BookingsModule made the regression tests pass. The proxy
  default-origin regression also failed before the shared-origin change.
- API: 107 unit, 65 HTTP, and 39 PostgreSQL integration tests passed; build,
  typecheck, and lint passed. Integration writes used only the guarded dedicated
  scheduler_test database, not either demo database.
- Frontend: 158 tests passed, 3 existing live tests skipped; production build
  (including TypeScript) passed. Proxy checks preserve the guest/staff credential
  boundary and route all three paths to one default backend.
- Live: all four scenario APIs returned 200 on the same process at port 3006;
  staff booking requests without the key returned 403. Persisted booking IDs,
  versions, and times matched the former appointment API before it was stopped.
- Browser: guest calendar/availability and staff persisted bookings loaded on
  the unified frontend at port 5176 after the former API was stopped; live
  availability/subscription indicators were connected. No demo booking was
  created, changed, or deleted during these checks. This does not independently
  prove cross-tab delivery after the merge.
- Scoped code review found no actionable issues. Updated diagram renders were
  visually inspected; documentation links, shell syntax, TOML configuration, SQL
  build assets, example-file tracking, and private backup ignores were checked.
- Fresh-machine database startup and seeding were not rerun. Current runtime
  retains two Supabase projects; shared-database consolidation is target design.

See `exports/unified-api-checks.json` and the adjacent guest/staff JPEGs.
