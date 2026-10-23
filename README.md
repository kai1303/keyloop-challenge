# Keyloop Interview

A dealership demo covering Appointment Scheduler, Intelligent Inventory, Sales
Lead Management, and Unified Document Viewer. **One React frontend and one NestJS
API**, plus one Supabase PostgreSQL database, serve all four scenarios.
All application code lives in this workspace;
the former appointment worktree is no longer needed to build, run, or test it.

See [Part 1: Architecture and Component Roles](docs/architecture.md) for diagrams
and component responsibilities. See the [REST API reference](docs/rest-api.md) for current routes, creation retry semantics, and lead pagination.

## Local services

| Service | Address | Role |
| --- | --- | --- |
| React frontend | http://127.0.0.1:5173 | Staff routes, guest bookings, and UI showcase |
| Unified NestJS API | http://127.0.0.1:3006 | Inventory, Leads, Documents, and guest/admin Appointments |
| Shared Supabase | API 55321, PostgreSQL 55322, Studio 55323 | Inventory, leads, appointments, and Realtime |

All application tables use `public`, including appointments and Better Auth.
Booking and authentication tables enable RLS and deny browser-role privileges.
Customers, staff and technician profiles share `public.users`; roles are `customer`, `technician`, or `admin`. Inventory/Leads use the Supabase Data API while
BookingsModule connects directly through TypeORM. Both Realtime clients use the
same project. The former scheduler project is retained only for rollback; see
the [database merge runbook](docs/database-merge.md). NestJS Observe and
OpenTelemetry were discussed but are not installed or required.

Staff sign in through Better Auth. NestJS requires a signed JWT for staff APIs:
Admin can access all modules; Technician can use every booking feature, including
rescheduling. Guest booking stays public. See [authentication and RBAC](docs/authentication.md).

## Prerequisites

- Node.js 22.12 or newer.
- pnpm 8.10.3, matching the root `packageManager` field.
- Docker with its daemon running.
- Supabase CLI; the commands below were checked against version 2.117.0.

Run commands from this repository's root. Environment-copy steps preserve
existing files. Use migrations to upgrade existing databases; do not run
`supabase db reset` to apply this merge.

## 1. Install dependencies

```sh
pnpm install --frozen-lockfile
```

## 2. Start the shared database project

Create its loopback-bound network if absent:

```sh
docker network inspect keyloop-inventory-local >/dev/null 2>&1 || \
  docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 keyloop-inventory-local
```

Start the project, apply inventory/lead migrations, and insert missing demo rows:

```sh
pnpm supabase:start --network-id keyloop-inventory-local
supabase migration up --local
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/sales-leads.sql
```

This retains the existing project ID `keyloop-inventory-local`. The seeds insert
missing records without replacing saved records. The million-vehicle benchmark
seed is optional. Scheduler migrations are applied by TypeORM in step 4, against
this same database; no second Supabase project is needed.

## 3. Configure the API and frontend

Copy examples without overwriting existing configuration:

```sh
cp -n apps/api/.env.example apps/api/.env
cp -n apps/web/.env.example apps/web/.env.local
supabase status
```

Copy the service-role, anon, and browser-safe publishable keys from this one
project's local status output. Never commit real keys; environment files are ignored by Git.

Set these values in `apps/api/.env`:

```dotenv
PORT=3006
FRONTEND_ORIGIN=http://127.0.0.1:5173
INVENTORY_SUPABASE_URL=http://127.0.0.1:55321
INVENTORY_SUPABASE_SERVICE_ROLE_KEY=replace-with-shared-service-role-key
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
DEALERSHIP_TIMEZONE=UTC
DEALERSHIP_OPENING_HOURS=[{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},null,null]
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://127.0.0.1:3006
```

The API now requires scheduler database/timezone/hours configuration at startup.
Leads reuse the inventory Supabase settings unless both `LEADS_SUPABASE_*`
overrides are deliberately configured. Document mock URLs derive from `PORT`.
The example appointment schedule is Monday–Friday 09:00–17:00 UTC; inventory
continues to use Asia/Ho_Chi_Minh independently. Preserve the scheduler's existing
timezone when reusing a database: changing it requires a metadata backfill.
For hosted PostgreSQL, also supply `PGSSLROOTCERT` as described in the API example.

Set these values in `apps/web/.env.local`:

```dotenv
INVENTORY_API_ORIGIN=http://127.0.0.1:3006
VITE_INVENTORY_SUPABASE_URL=http://127.0.0.1:55321
VITE_INVENTORY_SUPABASE_ANON_KEY=replace-with-shared-anon-key
VITE_BOOKINGS_SUPABASE_URL=http://127.0.0.1:55321
VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY=replace-with-shared-publishable-key
```

Generate the API secret with `openssl rand -hex 32`; save it only in the API environment.
`FRONTEND_ORIGIN` must match the browser origin exactly (including its port).
`INVENTORY_API_ORIGIN` now selects the unified API for every scenario. Remove an
old `BOOKINGS_API_ORIGIN` setting or point it to this same API; it remains an
optional compatibility override. A different `PORT` requires the matching web
origin and a Vite restart.

Both browser URLs must identify the same project. Keep the existing variable
names for compatibility: inventory uses its anon key, bookings its publishable
key, all obtained from `supabase status`.

The service-role key, SQL connection string, and Better Auth secret stay on the
server; never give them a `VITE_` prefix. Browser configuration contains only
project URLs and the appropriate anon/publishable keys.

## 4. Build, migrate, and create a staff account

```sh
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api migration:run:supabase
pnpm --filter @keyloop-interview/api db:seed
```

The build copies migration and seed SQL into `dist/database`. TypeORM retains
its existing migration names/history and runs unapplied migrations, including
the sanitized availability Broadcast triggers and private migration-history
permissions. The catalog seed inserts missing services, technicians, bays, and qualifications.
A forward TypeORM migration moves appointment and Better Auth tables into `public`, preserving records and denying browser access. Customer vehicles use `public.booking_vehicles`; stock stays in `public.vehicles`. The following identity migration combines customer, staff and technician records in `public.users`, retaining existing staff IDs and credentials. No schema synchronization or
startup reset is enabled; no old worktree or separate appointment API is needed.

Provision the first Admin from an ignored local file:

```sh
cp -n apps/api/.env.staff.example apps/api/.env.staff
# Edit .env.staff: name, email, password (9–128 characters), role=admin
pnpm --filter @keyloop-interview/api staff:create
```

To add a Technician, edit that same private file with the new account and
`STAFF_ROLE=technician`, then rerun `staff:create`. Existing users are not reset.
Remove the provisioning password from the file after use. Public signup is disabled.

## 5. Run the app

```sh
pnpm dev
```

This starts the single NestJS API and the single React frontend. To run them in
separate terminals instead:

```sh
pnpm --filter @keyloop-interview/api dev
```

```sh
pnpm --filter @keyloop-interview/web dev
```

The frontend routes `/api` and `/booking-api` to the same
backend. The browser supplies `Authorization: Bearer <JWT>` for staff requests. Public booking endpoints use `/api`; staff endpoints require the backend JWT/role guard. `/api/auth/*` forwards to Better Auth. Stop any old standalone appointment API
before reusing its port; it is no longer part of this run configuration.

| Scenario | URL | Try it |
| --- | --- | --- |
| Staff sign in | http://127.0.0.1:5173/login | Use your provisioned account. Staff URLs redirect here when signed out. |
| Intelligent Inventory | http://127.0.0.1:5173/admin/inventory | Filter/sort stock, log an action on a vehicle older than 90 days, then reload. |
| Sales Lead Management | http://127.0.0.1:5173/admin/leads | Open an enquiry, add a follow-up activity, and reload its history. |
| Unified Document Viewer | http://127.0.0.1:5173/admin/documents | View all documents or search VIN `1HGCM82633A004352`; open a preview. |
| Staff Appointment Scheduler | http://127.0.0.1:5173/admin/bookings | Manage persisted bookings, resources, rescheduling, cancellation, and status. |
| Guest Appointment Scheduler | http://127.0.0.1:5173/appointments | Choose a future open day and available hourly start, then book with fictional details. |
| Availability monitor | http://127.0.0.1:5173/appointments/monitor | Inspect exact-time availability and live updates. |
| Component showcase | http://127.0.0.1:5173/ | Browse the shared Keyloop UI components. |

Inventory actions, lead activities, and bookings persist in the same PostgreSQL
database, with appointment tables protected by RLS and grants in `public`. Documents come from two local mock
HTTP APIs inside this same NestJS process; no PDFs, uploads, or external service
credentials are required. In two browser tabs, Inventory or Bookings changes
invalidate the other tab through Realtime and trigger authoritative HTTP reads.
Leads and Documents use request/response updates without a subscription.

### Read-only API smoke checks

Every endpoint below is served by the same API:

```sh
# Obtain ACCESS_TOKEN using the sign-in/token flow in docs/authentication.md.
curl --fail --silent --show-error -H "Authorization: Bearer $ACCESS_TOKEN" 'http://127.0.0.1:3006/inventory?limit=10'
curl --fail --silent --show-error -H "Authorization: Bearer $ACCESS_TOKEN" 'http://127.0.0.1:3006/leads'
curl --fail --silent --show-error -H "Authorization: Bearer $ACCESS_TOKEN" 'http://127.0.0.1:3006/documents?vin=1HGCM82633A004352'
curl --fail --silent --show-error 'http://127.0.0.1:3006/service-types'
curl --fail --silent --show-error 'http://127.0.0.1:3006/schedule'
```

## Build and test

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm --filter @keyloop-interview/api test:e2e
```

Root commands run matching package scripts through Turborepo.
Frontend tests use at most two workers to leave capacity for concurrent API
checks and builds; the default test timeouts and assertions remain enabled.
API unit/HTTP tests override storage; they do not need the running demo databases.
They include appointment DTOs, schedule/resource rules, transaction/retry behavior, guarded
admin endpoints, and a unified-AppModule regression covering all four scenarios.
Frontend tests include guest calendars, Realtime listeners, routing, and real
HTTP proxy fixtures. Three inventory live tests are opt-in rather than ordinary
unit checks. A passing mock test does not prove real persistence or WebSockets.

### PostgreSQL integration tests

Use only the dedicated disposable `scheduler_test` fixture:

```sh
cp -n apps/api/.env.test.example apps/api/.env.test
docker compose -f compose.scheduler-test.yaml up -d --wait
pnpm --filter @keyloop-interview/api test:integration
```

The fixture is on port 54329, separate from the shared demo database. These tests
truncate/reset its public booking tables and verify transactions, concurrent
allocation, status changes, preservation of old records during migrations, and
a transactional Broadcast stub. They also reset the fixture’s public authentication tables
and exercise real Better Auth sign-in, JWT signatures/expiry, revoked sessions,
role changes, CSRF/origin checks, and database privacy. They refuse other database names/non-loopback
hosts. Actual Supabase/browser delivery is a separate verification step.

The shared-database check is read-only. Inventory SQL tests roll back their
fixture changes:

```sh
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/shared-database.sql
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/inventory.sql
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/inventory-query.sql
```

For opt-in lead database checks, see
[Sales Leads API setup](apps/api/README.md#sales-leads-api). Inventory live-test
configuration is in the
[inventory implementation plan](docs/superpowers/plans/2026-10-21-intelligent-inventory-dashboard.md).

## Stop and restart

Stop the app processes with Ctrl+C. Stop the shared database project while retaining
data volumes with:

```sh
pnpm supabase:stop
```

Restart the stack with the commands above, then `pnpm dev`. Existing databases
only need unapplied migrations; ordinary restarts do not require reseeding.
Do not use `--no-backup`, `--all`, or `supabase db reset` for normal restarts.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API fails during startup | Check `DATABASE_URL`, scheduler connectivity, dealership timezone, and seven opening-hour entries. Scheduler configuration is required by the merged API. |
| Address already in use | Stop the former appointment API or choose a free unified API port and update `INVENTORY_API_ORIGIN`. |
| Inventory/Leads returns 503 | Check the operations URL/service-role key, running project, and applied migrations. |
| Staff APIs return 401/403/503 | Sign in; Technician only has booking access. Check the auth migration, API secret, base URL, and exact frontend origin. |
| Guest calls still use an old API | Remove `BOOKINGS_API_ORIGIN` or set it to the unified origin, then restart Vite. |
| Data loads but live updates do not | Check each scenario's browser-safe URL/key and sanitized Broadcast migrations. |
| No available booking starts | Choose a future open weekday/hour; the current catalog uses 60-minute services and whole-hour starts. |
| Documents shows partial results | Check its local mock endpoint overrides. One unavailable source intentionally yields a partial result. |
| Deployed frontend cannot call API | Vite proxies are development infrastructure. Production needs equivalent routing, HTTPS, and reviewed deployment settings; see the authentication guide. |

## AI Collaboration Narrative

AI assisted with scenario design, implementation, tests, and documentation.
Work was guided by explicit business rules and the existing admin UI, including
stock-age boundaries, allocation conflicts, activity retries, and partial source
failures. Verification separates unit/HTTP fixtures, real PostgreSQL checks, and
live browser/Realtime evidence; one does not substitute for another.

The frontend and API integrations reused the working appointment implementation
rather than rewriting its domain logic. Regression tests first demonstrated the
missing guest routes and then missing booking endpoints in the main application.
The merge preserves validation, the staff guard, transaction locking, and existing
migration history. The database merge was rehearsed by restoring both backups together and
comparing every application table by count and canonical row hash. Live checks
then verified the shared project's HTTP access rules and both WebSocket paths.
The isolated test suite also verifies migration-history permissions. Run the checks above for
fresh results; saved reports describe the run that produced them.

For authentication, AI was directed to use Better Auth with JWTs and an explicit
Admin/Technician permission matrix. Backend verification checks the signature,
issuer, audience and expiry, then reads the current session and role from PostgreSQL.
Real integration tests cover forged/expired tokens, role escalation, logout and
private schemas. Review found concurrent-renewal and same-user sign-in bugs;
regression tests reproduced both before fixes. Browser checks separately validate
login, navigation, protected pages, and logout. Dependency defaults and generated
SQL were checked against the installed package and official documentation.

## Repository layout

- `apps/web`: one React frontend for staff, guest appointments, and the showcase.
- `apps/api`: one NestJS app with Inventory, Leads, Documents, and Bookings modules.
- `apps/api/src/database`: TypeORM scheduler connection, migrations, and catalog seed.
- `packages/ui`: shared Keyloop UI components and styling.
- `packages/keyloop-design-system`: design tokens and reference assets.
- `supabase`: shared project configuration, inventory/lead migrations, seeds, and SQL checks.
- `infra/appointments/supabase`: former scheduler project configuration, retained only for rollback.
- `compose.scheduler-test.yaml`: isolated PostgreSQL test fixture.
- `docs`: architecture and implementation plans.
- `exports`: screenshots and verification/benchmark reports; historical evidence rather than current runtime guarantees.
