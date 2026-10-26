# Keyloop API

One NestJS API hosts Inventory, Sales Leads, Documents, and guest/admin
Appointments. Follow the root [runbook](../../README.md) for database setup and
complete environment configuration. All feature code and scheduler migrations
now live in this workspace; no separate appointment checkout is required.

After completing that setup, run these commands from the workspace root:

```sh
pnpm install
pnpm --filter @keyloop-interview/api dev
```

The configured API responds to `GET http://127.0.0.1:3006/` with `Hello World!`.
Set `PORT` to use a different port, for example:

```sh
PORT=3001 pnpm --filter @keyloop-interview/api dev
```

## Staff authentication

Better Auth handles email/password login and session renewal at `/auth/*`.
NestJS staff APIs require JWT access tokens; a session cookie alone does not grant
access. Admin can access all modules. Technician can list, create, reschedule,
cancel, start and complete all bookings. Guest endpoints remain public.

See [authentication and RBAC](../../docs/authentication.md) for provisioning,
JWT/cookie flow, endpoint contracts, privacy controls, and the permission matrix.

## Checks

```sh
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api lint
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api test:e2e
```

After building, run `pnpm --filter @keyloop-interview/api start:prod` to start
the compiled application.

## Inventory API

`GET /inventory` filters, sorts and pages stock in PostgreSQL. It returns
`vehicles`, `nextCursor`, `pageSize`, dealership date/timezone and server time.
The default is 25 vehicles, oldest first. For example:

```text
/inventory?make=Toyota&age=aging&action=needsAction&sort=daysInStock:desc,pricePence:asc&limit=25
```

- `make` and `model` can be repeated for OR matching within each field; fields
  combine with AND. `age` accepts `all`, `0-30`, `31-60`, `61-90` or `aging`
  (strictly over 90 days). `action` accepts `all`, `needsAction` or a saved action.
- `sort` accepts up to three ordered `key:asc|desc` pairs. Keys are `vehicle`,
  `registration`, `pricePence`, `daysInStock` and `currentAction`. The unique
  vehicle ID breaks ties. `limit` is 1–100.
- Pass `nextCursor` as `after` with the same query for the next page. Cursors
  are opaque, validated and bound to filters/sort/page size. Invalid inputs
  return 400. SQL uses keyset seeking and one extra row, with no OFFSET or
  per-page exact count. A cursor browses live stock, not a frozen snapshot.

`GET /inventory/metadata` independently returns dealership-wide
`summary: { total, aging, needsAction }` and make/model `options`.
`GET /inventory/:id` reads one vehicle, including when it is outside the current
page; this supports reviewing conflicting action edits.
`PATCH /inventory/:id/action` accepts `action`, optional `note`, and required
`expectedVersion`. Actions apply only to stock over 90 days. Updates are locked
and version-checked inside PostgreSQL; stale edits return 409 for explicit review.

The API reads ignored `.env` values at startup. Configure
`INVENTORY_SUPABASE_URL` and `INVENTORY_SUPABASE_SERVICE_ROLE_KEY` for the local
stack. Missing configuration returns 503 for inventory without breaking the
starter endpoint. Database errors and credentials are not returned to clients.

Inventory endpoints require an Admin JWT. Browser roles cannot read or write
inventory directly. Sanitized empty Broadcasts trigger authenticated HTTP reads;
the Supabase service-role key stays server-only.

Use `supabase migration up --local` for schema upgrades. `supabase/seed.sql`
inserts missing fictional samples without updating existing rows/actions.
SQL behavior checks are in `supabase/tests/inventory.sql` and
`supabase/tests/inventory-query.sql`; their transactions roll back owned fixtures.
The query migration adds service-role-only `inventory_page` and
`inventory_metadata` RPCs plus stock-date, price and make/model indexes. Filter
values and cursor values are SQL parameters; sort expressions use a whitelist.
Metadata aggregates still depend on dataset size, and mixed/computed sort paths
need measurement before claiming million-row performance. No large dataset is
seeded during normal startup. Two-browser delivery and restart persistence are
separate acceptance checks in the inventory implementation plan.

`20261022000300_inventory_performance.sql` adds C-collation vehicle and
registration cursor indexes (including the vehicle descending order with its
ascending ID tie-break), plus a narrow stock-date/action index for exact totals.
The page RPC sorts and limits rows before JSON serialization. Metadata evaluates
the dealership aging cutoff once per call and remains fresh on every read;
there is no summary cache. Computed-action sorting and exact global aggregates
still inspect the dataset. `supabase/tests/inventory-performance.sql` checks
reverse/mixed cursor ordering, fresh metadata after edits and RPC permissions.

### Local benchmark dataset

The explicit seed below fills the existing inventory to **1,000,000 total rows**
without updating existing records or actions. It is not part of migrations or
normal startup. Verify the named local project before running:

```sh
docker exec -i supabase_db_keyloop-inventory-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/inventory-benchmark.sql
```

Synthetic rows use both `b1000000-0000-4000-8000-` as their UUID prefix and
`KL-BENCH-` as their registration prefix. The seed has 12 makes, 36 make/model
pairs, weighted make distribution, 0–730 days in stock, price/sort ties and
saved/missing actions on aging vehicles. It asserts the final count and unchanged
pre-existing rows before commit, then runs `ANALYZE` for planner statistics.
Rerunning skips existing synthetic IDs and preserves their saved edits. Inserts
temporarily block inventory writes and generate normal Realtime WAL. The seed
prepares functional data only; run performance measurements separately after
ingestion and Realtime processing settle. This distribution is synthetic and
does not establish production performance.

Run the read-only benchmark separately with the API listening on port 3006.
Set `INVENTORY_BENCHMARK_ACCESS_TOKEN` privately to a fresh Admin JWT first;
see the [token flow](../../docs/authentication.md). Tokens expire after five minutes.

```sh
python3 supabase/tests/benchmark-inventory.py
```

It requires exactly 1,000,000 vehicles, validates response ordering and filters,
and measures 14 API cases (2 warmups and 20 samples each), then mixed bursts of
100 requests at concurrency 5 and 10. A deep cursor starts after the 750,000th
row; its SQL boundary lookup is untimed setup, not part of the cursor latency.
Results, individual samples, failures and environment details are saved to
`exports/inventory-benchmark-results.json`. HTTP latencies include body reads and
JSON validation. Percentiles include successful validated responses only, with
failures counted separately and a 10-second client timeout. Warm shared caches,
new client connections and this shared development machine affect the results;
the short closed-loop bursts do not establish maximum capacity or browser paint
performance. The benchmark does not seed, update or delete inventory.

Set `INVENTORY_BENCHMARK_OUTPUT` to a separate JSON filename under `exports/`
to preserve before/after runs. The current authenticated comparison is in
`exports/inventory-performance-before.json` and
`exports/inventory-performance-after.json`; these include the per-request staff
JWT/session/role checks. The historical `inventory-benchmark-results.json`
predates authentication. See `exports/inventory-performance-report.md` for the
comparison, expanded query plans and the remaining limits.

## Sales Leads API

- `GET /leads?limit=50&after=<cursor>` returns `{ leads, nextCursor }`, newest first with UUID tie-breaking. The default page is 50 records, the maximum is 100, and `nextCursor: null` marks the end.
- `GET /leads/:id` returns full details and history, oldest first.
- `POST /leads/:id/activities` accepts `{ "id": "<new UUID>", "note": "Called customer" }`.
  Notes are trimmed, nonblank and at most 2,000 characters. The database creates
  the timestamp. A new record returns 201; an identical retry returns 200;
  conflicting reuse of an ID returns 409. Keep the same UUID when retrying an
  uncertain save.

Sales Leads reuses `INVENTORY_SUPABASE_URL` and
`INVENTORY_SUPABASE_SERVICE_ROLE_KEY` from the ignored API `.env` by default.
Optional `LEADS_SUPABASE_URL` / `LEADS_SUPABASE_SERVICE_ROLE_KEY` overrides must
point to a loopback-only Supabase project. Missing configuration returns a clear
503 for lead requests while leaving the other API routes available. Never put a
service-role key in frontend variables.

Apply `supabase/migrations/20261021000300_sales_leads.sql` to the identified local
project with `supabase migration up --local` from the repository root. The current
project is `keyloop-inventory-local` on API 55321 / PostgreSQL 55322. Seed only
fictional leads explicitly, from the repository root:

```sh
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/sales-leads.sql
```

This seed can be repeated without overwriting saved data. Normal server startup
does not seed or reset the database. Lead tables deny anonymous Supabase access;
only the backend uses the service-role key. Do not reset or stop a shared local
project to test this feature.

From `apps/api`, run `pnpm dev` (bootstrap already loads `.env`) or build and run
a separate local API using:

```sh
pnpm build
PORT=3007 node --env-file=.env dist/main.js
```

Unit/HTTP checks:

```sh
pnpm test src/leads/leads.controller.spec.ts
pnpm test:e2e
```

`pnpm test:leads-db` is an explicit real-database suite. It requires ignored
`.env.leads-test` with `LEADS_TEST_PROJECT=keyloop-leads-tests`,
`LEADS_TEST_SUPABASE_URL`, `LEADS_TEST_SERVICE_ROLE_KEY` and `LEADS_TEST_ANON_KEY`.
Use a separate disposable loopback project on free ports (56321 / 56322 / 56323
were used during implementation), apply the same migration, and set these values
privately from that project's status. The suite creates random owned lead IDs and
cleans up only those rows. Ordinary unit tests need no database.

Leads endpoints require an Admin JWT. The API is bound to loopback; use fictional data
only. Website ingestion, author identity, editing/deleting activities and public
hosting are outside this demo.

## Document aggregation

The document pipeline has two layers:

- `src/documents/document-sources.client.ts` handles HTTP and bounded timeouts.
  `DocumentAdapterFactory` resolves a registered, stateless adapter by source ID.
  Sales and Service adapters own their URL paths and field mapping; the common
  `document-normalizer.ts` validates their output into `VehicleDocument[]`.
- `src/documents/documents.service.ts` validates the search, loads every configured
  source in parallel, handles partial failures, merges normalized lists, sorts
  newest first (document ID breaks date ties), and calculates labelled counts.
  Aggregation has no source-specific branches and is testable without HTTP.

The controller calls the aggregation service. Response `sources` is keyed by
source ID and includes `label`, `status` and `count`; the browser validates and
renders these dynamically, including preview labels and unavailable sources.

### Adding another source system

1. Create an adapter in `src/documents/adapters/` implementing
   `DocumentSourceAdapter`: `id`, `label`, `path(vin)` and `normalize(body, vin)`.
   `path` returns a relative request path for both all-documents and VIN modes.
2. Map its upstream fields with `documentRecord` and `normalizeDocuments`, as the
   existing Sales/Service adapters do. Keep source-specific field names inside
   the adapter. The helper validates VINs, dates, strings, record limits and
   duplicate IDs, and namespaces each ID as `<source>:<upstream ID>`.
3. Register its instance in the `DOCUMENT_ADAPTERS` provider in
   `documents.module.ts`, then add its base URL under the same ID to the `urls`
   record in `createDocumentSources`. For example:

   ```ts
   // DOCUMENT_ADAPTERS factory
   [new SalesDocumentAdapter(), new ServiceDocumentAdapter(), new WarrantyDocumentAdapter()]

   // createDocumentSources().urls
   { sales: salesUrl, service: serviceUrl, warranty: warrantyUrl }
   ```

4. Add adapter payload tests and an HTTP scenario. No aggregator or UI source
   list changes are required. `test/documents.e2e-spec.ts` demonstrates this with
   a test-only Finance adapter using `/agreements?vehicle=<VIN>` and a third
   payload format; both VIN and all-document requests dispatch all three APIs
   before either response is released.

Source IDs are unique lower-case identifiers (up to 32 characters), labels are
nonblank and up to 80 characters. Unknown IDs and duplicate adapter registrations
are rejected explicitly. The local demo allows 1–20 configured sources and at
most 100 documents per source; larger datasets need a pagination contract.
All source URLs remain loopback-only. No third production system is enabled.

`GET /documents` lists all documents by default (missing or blank VIN).
`GET /documents?vin=<VIN>` normalizes and validates a nonblank 17-character VIN
and filters the list. Both modes fetch Sales and Service concurrently with `Promise.allSettled`. Each request
has a three-second timeout. Responses include source status/counts and namespaced
document IDs and each document's VIN; the response filter `vin` is null for all vehicles. Malformed source data is unavailable, not an empty success.
One failed source yields a partial 200; both failures yield a safe 502.

Default mock base URLs use `http://127.0.0.1:${PORT}/mock/sales` and `/mock/service`
with PORT defaulting to 3000. Optional `DOCUMENT_SALES_API_URL` and
`DOCUMENT_SERVICE_API_URL` overrides must be loopback URLs. The mock routes are
separate logical APIs hosted in the same Nest process for this local demo.
Aggregation makes real HTTP requests, not direct calls to their fixture functions.

Run `pnpm --filter @keyloop-interview/api test src/documents/documents.service.spec.ts`
and `pnpm --filter @keyloop-interview/api test:e2e`. HTTP tests gate both upstream
responses until both requests arrive, and own/clean their local servers.

## Appointments in the unified API

`BookingsModule` registers the existing guest and guarded admin controllers,
resource allocator, schedule rules, and TypeORM connection in `AppModule`.
The same process continues to serve `/inventory`, `/leads`, and `/documents`.
Booking confirmation and rescheduling use atomic transactions, ordered
technician/bay row locks, post-lock availability rechecks and booking version checks; database synchronization is disabled.

Configure `DATABASE_URL`, `DEALERSHIP_TIMEZONE`, and
`DEALERSHIP_OPENING_HOURS` in the API's `.env`, plus `BETTER_AUTH_SECRET` and
`BETTER_AUTH_URL` as described in the root setup guide. Scheduler configuration and its database connection are
required at startup. Inventory/Leads still use their Supabase Data API settings.
`DATABASE_URL` now points to the same project as `INVENTORY_SUPABASE_URL`: local
SQL port 55322 and Data API port 55321. All application tables use public; booking and auth tables deny browser access and enable RLS.
The [database merge runbook](../../docs/database-merge.md) records preservation
and rollback details.

Guest endpoints are `GET /schedule`, `GET /service-types`,
`GET /bookings?month=YYYY-MM`, `GET /availability`,
`GET /availability/slots`, and `POST /bookings`.
The monthly read returns anonymous calendar entries only (`{month, bookings}`).
The guest form queries `/availability` after selecting a service and time. After
loading the service duration, one SQL statement returns named free technicians
and bays using full-interval `NOT EXISTS` checks; no bitmap or cache is built.
The resource lists enforce qualifications and unbanned technician roles. Both
resource selections are required for guest creation. Time choices reflect hours,
with capacity checked on selection. Realtime/focus refresh the selected interval.
POST locks and rechecks the exact pair using the same SQL. The day preview endpoint
uses the query over all generated starts without per-slot round trips. See the
[response contract](../../docs/rest-api.md#calendar-and-selected-time-resources).
Staff endpoints under `/admin/bookings` require an Admin or Technician JWT and
include catalog/list/create, item reads, versioned `PATCH /admin/bookings/:id` rescheduling, and status changes.
Global DTO validation preserves guest field restrictions and admin versions.

From the repository root:

```sh
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api migration:run:supabase
pnpm --filter @keyloop-interview/api db:seed
```

TypeORM retains the existing migration names and history table. SQL files are
copied into `dist/database` by the Nest build. Reapplying pending migrations does
not require resetting the scheduler database. Realtime uses sanitized date-only
Broadcasts, and browsers continue to refetch through the same API.

The disposable PostgreSQL test fixture is now `compose.scheduler-test.yaml` in
this repository. Copy `apps/api/.env.test.example` to `apps/api/.env.test`, start
that fixture, then run `pnpm --filter @keyloop-interview/api test:integration`.
The suite is guarded to the loopback `scheduler_test` database; its writes and
schema resets must never target the shared demo database. Ordinary unit/HTTP tests
override storage and do not require the running scheduler database.

## Double-booking protection

Each booking write uses one READ COMMITTED transaction. Parameterized SQL selects
qualified resources using `NOT EXISTS` over bookings overlapping the exact requested
interval, including legacy cross-midnight intervals. The allocator reads the
scheduling versions of the old/new technician `users` and `service_bays` rows,
then conditionally increments them in ID order. PostgreSQL locks rows during each
update. A fresh read rechecks only the selected pair after the claims. Changed
candidates roll back and reselect;
deadlocks/lock timeouts also retry, with at most three transaction attempts.
Exhausted contention returns 503. Unavailable capacity or stale booking edits return 409.

`service_bookings` is the only persisted occupancy state. Rescheduling updates that
row; cancellation sets CANCELLED and frees its time. IN_SERVICE and COMPLETED
retain occupancy. All status changes lock the current resource rows. Conditional
booking-version updates continue to reject stale edits. Contact/vehicle writes
and booking changes commit or roll back together.

The forward `BookingResourceLocks1792800000002` migration drops only
`public.resource_slots` without CASCADE. Stop all old booking writers before
applying it, then restart the built API. Existing bookings, auth records and
Realtime triggers are preserved. Historical migrations remain unchanged; fresh
setup creates and removes the old table through the migration chain.

All writers must use this protocol; direct SQL booking writes bypass it.
Availability previews reserve nothing. Writes sharing a technician or bay
serialize even across different hours/dates; unrelated resource pairs remain
independent. Existing B-tree interval indexes remain; no GiST index is added.
Recovery requires the verified pre-cutover backup and matching source, or an
explicit re-backfill of historical claims while writers are stopped.

The saved [local concurrency report](../../exports/booking-locks-e2e-results.json)
records an earlier run. Current concurrency behavior is checked in the
disposable PostgreSQL integration suite.

## Booking REST contract

The canonical public collection is `GET /bookings?month=YYYY-MM` (a customer-safe `{month, bookings}` snapshot) and `POST /bookings` (limited confirmation). Staff use `/admin/bookings`: GET with `date`, POST, GET/PATCH `/:id`, PATCH `/:id/status`, and GET `/catalog`. The old `/service-bookings`, `/calendar-bookings`, and `/:id/reschedule` routes are removed; update external callers with the frontend.

Guest POST requires `technicianId` and `serviceBayId`; staff POST keeps them optional. Explicit selections never fall back to a different resource when unavailable. Creation has no replay key: a repeated POST is a new attempt. After a timeout or lost response, check the calendar or staff booking list before submitting again. The transaction commits or rolls back booking and contact records together; staff GET returns current state.

Creation returns 201 and `Location: /admin/bookings/<id>`. That item URL always requires an Admin or Technician JWT; a guest confirmation does not grant access to customer details. No public item lookup was added.

Build and run `migration:run:supabase` before starting this API against the shared local database (or `migration:run` for the standalone scheduler database). `DropBookingRequests1792972800000` removes the obsolete retry-record table; existing bookings remain.

The complete current route list is in [REST API reference](../../docs/rest-api.md).

## Public schema consolidation

`PublicSchema1792800000000` moves the previous scheduler and staff_auth tables into public without copying their rows. Customer service vehicles are renamed to `booking_vehicles`, preserving the stock `vehicles` table. Foreign keys, IDs, resource versions, sessions and trigger attachments survive the move. Both migration commands register this forward migration; historical migrations remain unchanged for fresh setup. Run the migration before starting the updated API. Browser access to moved tables is denied by ACLs and RLS. Supabase platform schemas are unchanged.

## Unified users

`UnifiedUsers1792800000001` consolidates customer, staff, and technician profiles into `public.users`, using text IDs and customer/technician/admin roles. It retains staff account/session IDs and technician IDs, merges normalized customer/staff email matches using the staff ID, and repoints existing foreign keys. Legacy technician profiles have no invented credentials or email. Service qualifications remain in `technician_service_types`; allocation requires technician role and an unbanned profile. Technician IDs in staff booking requests may be text IDs; bay/service/booking IDs remain UUIDs. Guest booking cannot overwrite profile roles or credentials.
