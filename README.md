# Keyloop Interview

A dealership demo with Appointment Scheduler, Intelligent Inventory, Sales Lead
Management, and Unified Document Viewer. One React frontend, one NestJS API, and
one Supabase PostgreSQL database serve all four scenarios.

## HOW TO RUN

### Requirements

- Node.js 22.12 or newer
- pnpm 8.10.3
- Docker running
- Supabase CLI (setup previously checked with 2.117.0)

Run every command below from the repository root, unless cloning it first.

### 1. Install dependencies

```sh
git clone https://github.com/kai1303/keyloop-challenge.git
cd keyloop-challenge
pnpm install --frozen-lockfile
```

Already cloned? Run only `pnpm install --frozen-lockfile` from your checkout.

### 2. Start the database

```sh
docker network inspect keyloop-inventory-local >/dev/null 2>&1 || \
  docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 keyloop-inventory-local
pnpm supabase:start --network-id keyloop-inventory-local
supabase migration up --local
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/sales-leads.sql
```

This creates the shared database and inserts missing inventory/lead demo records.
It does not require the optional million-vehicle benchmark dataset.

### 3. Set environment values

```sh
cp -n apps/api/.env.example apps/api/.env
cp -n apps/web/.env.example apps/web/.env.local
supabase status
openssl rand -hex 32
```

Fill in these blank values in the copied files:

| File | Variable | Value |
| --- | --- | --- |
| `apps/api/.env` | `INVENTORY_SUPABASE_SERVICE_ROLE_KEY` | Service-role key from `supabase status` |
| `apps/api/.env` | `BETTER_AUTH_SECRET` | Random secret from `openssl rand -hex 32` |
| `apps/web/.env.local` | `VITE_INVENTORY_SUPABASE_ANON_KEY` | Anon key from `supabase status` |
| `apps/web/.env.local` | `VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY` | Publishable key from `supabase status` |

Keep the remaining example values for local setup. They configure API port 3006,
frontend port 5173, PostgreSQL port 55322, and appointments Monday–Friday
09:00–17:00 UTC. All Supabase keys must come from the same local project.
Server secrets stay in the API file; only anon/publishable keys belong in the
frontend file. Both files are ignored by Git.

### 4. Build the API and apply appointment migrations

```sh
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api migration:run:supabase
pnpm --filter @keyloop-interview/api db:seed
```

The seed adds missing services, technicians, bays, and qualifications. Migrations
upgrade the existing database without resetting saved records. Do not use
`supabase db reset` for an existing installation.

### 5. Create an admin account

```sh
cp -n apps/api/.env.staff.example apps/api/.env.staff
```

Edit `apps/api/.env.staff`: set `STAFF_NAME`, `STAFF_EMAIL`, `STAFF_PASSWORD`
(9–128 characters), and `STAFF_ROLE=admin`. Then run:

```sh
pnpm --filter @keyloop-interview/api staff:create
```

Remove the password from that private file after provisioning. Public signup is
disabled. To provision a technician login, use `STAFF_ROLE=technician`; see
[authentication and permissions](docs/authentication.md) for provisioning details.

### 6. Start the application

```sh
pnpm dev
```

This starts both the frontend and API. Open:

| Page | URL |
| --- | --- |
| Guest bookings | http://127.0.0.1:5173/appointments |
| Staff sign in | http://127.0.0.1:5173/login |
| Staff bookings | http://127.0.0.1:5173/admin/bookings |
| Inventory | http://127.0.0.1:5173/admin/inventory |
| Sales leads | http://127.0.0.1:5173/admin/leads |
| Documents | http://127.0.0.1:5173/admin/documents |
| Component showcase | http://127.0.0.1:5173/ |

Sign in with the account from step 5. Admins can use all modules; technicians
have booking access. Guest bookings are public: select a service, future open
time, available technician, and bay, then enter fictional customer details.
The API runs at `http://127.0.0.1:3006`; Vite proxies `/api` and `/booking-api` to it.
Documents use local mock services and need no external credentials.

### Stop and restart

Stop the application with Ctrl+C. Stop Supabase while retaining data:

```sh
pnpm supabase:stop
```

On later runs, start the existing database and app; no reseeding is needed:

```sh
pnpm supabase:start --network-id keyloop-inventory-local
pnpm dev
```

After pulling database changes, apply unapplied migrations from steps 2 and 4.

## HOW TO BUILD AND TEST

After installing dependencies, run these without Docker or database credentials:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @keyloop-interview/api test:e2e
pnpm build
```

- `pnpm test`: frontend, API unit, shared UI, and design-system tests.
- `test:e2e`: API HTTP contracts and guards using controlled test storage.
- `pnpm lint`: API type-aware lint; frontend checks use TypeScript and tests.
- `pnpm build`: compiled API in `apps/api/dist`, frontend in `apps/web/dist`.

After database setup, run the compiled API with
`pnpm --filter @keyloop-interview/api start:prod`. Production frontend hosting must
serve `apps/web/dist` and route `/api` and `/booking-api` to the API; the Vite
proxy only runs during development.

### PostgreSQL integration tests

These tests require Docker and use a separate disposable database:

```sh
cp -n apps/api/.env.test.example apps/api/.env.test
docker compose -f compose.scheduler-test.yaml up -d --wait
pnpm --filter @keyloop-interview/api test:integration
docker compose -f compose.scheduler-test.yaml down
```

Keep `TEST_DATABASE_URL` pointed at `scheduler_test` on loopback port 54329.
The suite resets its fixture tables and checks migrations, authentication,
transactions, concurrent allocations, and stale booking versions.
Never point it at the application database on port 55322.

Three inventory live tests are skipped by default. Their explicit local setup is
in the [live-test source](apps/web/src/admin/inventory/inventory.live.test.ts).

### Check the full booking flow

1. Create a guest booking with fictional details and selected resources.
2. Sign in, find it under staff bookings, and reload to confirm persistence.
3. Keep a second guest tab open on the same service/time. Cancel the booking
   from the staff tab and confirm that the available resources refresh.

Unit/HTTP tests do not prove browser Realtime delivery. Screenshots and reports
in `exports` describe earlier checks, not the result of your current run.

## Troubleshooting

| Problem | Check |
| --- | --- |
| API fails to start | Complete the API environment values and apply both sets of migrations. |
| Port already in use | Stop the existing process on 3006 or 5173. |
| Staff requests return 401/403 | Sign in with the provisioned account; technicians only have booking access. |
| Inventory/Leads returns 503 | Check the service-role key, running Supabase project, and migrations. |
| No available resources | Choose a future weekday/hour; check technician qualifications and existing bookings. Services currently last 60 minutes. |
| Live updates do not arrive | Check both browser-safe Supabase keys and the appointment Broadcast migrations. |

See [architecture](docs/architecture.md), [REST APIs](docs/rest-api.md),
[authentication](docs/authentication.md), and the
[database recovery runbook](docs/database-merge.md) for implementation details.

## AI Collaboration Narrative

### Strategy for guiding the AI

I used AI for implementation, tests, reviews, and documentation, while directing
the business rules and design decisions. Work was broken into scoped changes
across the four scenarios rather than one request to generate the entire app.
The existing code, shared UI components, and database contracts were the starting
point. Plans and design notes under `docs/superpowers` record those decisions.

Prompts specified observable behavior and failure cases: inventory actions apply
only after 90 days in stock; bookings require a qualified technician and a free
bay; activity retries must not duplicate writes; unavailable document sources
must produce explicit partial results. I also required one frontend, one API,
and one shared database, with existing data preserved during consolidation.

The booking design evolved through review. Earlier bitmap and resource-slot
approaches were simplified to query available technicians and bays directly for
the selected interval. The guest chooses both resources; the API validates and
rechecks that exact pair during the booking transaction. This kept the interface
and persistence rules aligned with the requested behavior.

### Verifying and refining the output

Generated code was treated as a proposal to inspect and test. Changes were
checked across callers, DTOs, SQL, migrations, UI state, and error handling.
Verification used separate layers:

- **Unit and frontend tests:** business boundaries, invalid inputs, loading/error
  states, stale responses, resource selection, and uncertain confirmation behavior.
- **HTTP tests:** endpoint contracts, status codes, staff permissions, and unified
  application wiring with controlled storage.
- **Real PostgreSQL tests:** migration preservation, overlapping bookings,
  concurrent resource allocation, stale version conflicts, and
  authentication/session rules in the disposable fixture.
- **Browser and runtime checks:** login, navigation, persistence after reload,
  request duplication, selected-time resource results, and cross-tab Realtime
  updates against the running local services.

Failures and observations drove follow-up changes. For example, missing guest
routes and booking endpoints gained regression coverage during integration;
concurrent session-renewal and repeated sign-in bugs were reproduced before
authentication fixes. Duplicate frontend requests were inspected in the browser
and checked again after changes. The final SQL resource query was also compared
with independent database results for selected times.

Data changes received separate checks. The database consolidation was rehearsed
by restoring backups together and comparing application-table counts and
canonical row hashes. Inventory query changes were measured through authenticated
HTTP requests and query plans; the saved benchmark reports include dataset,
index-memory cost, and workload limitations rather than claiming general
production performance.

### Ensuring final quality

The final checks combine TypeScript, API lint, production builds, unit/HTTP
tests, and PostgreSQL integration tests. Trust-boundary checks remain on the
server: request validation, JWT/session/role checks, private database access,
resource-version claims for allocation and booking versions for stale edits.
Credentials and local backups
are excluded from Git. The setup and test commands above are the repeatable
review path.

The evidence has limits. Mock-backed tests do not prove persistence or WebSocket
delivery; those require the database and browser checks. Saved reports describe
their recorded runs. A clean-machine installation, production deployment,
production load, and a deployed observability stack are not established by
those reports. Implemented behavior and proposed deployment/telemetry work are
separated in the [architecture document](docs/architecture.md).

## Repository layout

- `apps/web`: one React frontend for staff, guest appointments, and the showcase.
- `apps/api`: one NestJS app with Inventory, Leads, Documents, and Bookings modules.
- `apps/api/src/database`: TypeORM scheduler connection, migrations, and catalog seed.
- `packages/ui`: shared Keyloop UI components and styling.
- `packages/keyloop-design-system`: design tokens and reference assets.
- `supabase`: shared project configuration, inventory/lead migrations, seeds, and SQL checks.
- `compose.scheduler-test.yaml`: isolated PostgreSQL test fixture.
- `docs`: architecture and implementation plans.
- `exports`: screenshots and verification/benchmark reports; historical evidence rather than current runtime guarantees.
