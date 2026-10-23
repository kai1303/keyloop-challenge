# Part 1: Architecture and Component Roles

This document describes the four implemented dealership scenarios: Appointment
Scheduler, Intelligent Inventory, Sales Lead Management, and Unified Document
Viewer. It covers the architecture diagrams, component responsibilities,
end-to-end data flow, technology choices, and observability strategy requested
for Part 1.

The diagrams describe the implementation as consolidated on 22 October 2026:
one frontend, one NestJS API, and one shared Supabase PostgreSQL project, with Better Auth JWT staff access.
Solid arrows show requests or database access; dashed arrows show change
notifications. HTTP responses return along the request path.

## 1. Overall architecture

![Architecture of the four dealership scenarios](architecture/overview.svg)

One React application serves the staff scenarios and guest booking pages.
`/admin/*` routes share the admin layout; `/appointments` and its availability
routes use the guest interface outside that layout. Both run from the same web
server and share the UI package and application providers. One NestJS process
hosts Inventory, Leads, Documents, and Bookings modules through `AppModule`.
`BookingsModule` contains both guest and guarded staff endpoints, the resource
allocator, and its TypeORM connection. All application code, scheduler migrations,
and tests live in this workspace; the old appointment worktree is no longer a
runtime or build dependency. The document sources are mock HTTP endpoints hosted
inside this same API process rather than independently deployed services.

**Shared database:** Supabase provides PostgreSQL; they are not two different
database technologies. The implementation uses one Supabase project and one
PostgreSQL database. All application tables live in `public`, including appointments and Better Auth.
Booking and auth tables have RLS enabled and browser-role privileges revoked. Inventory and leads access
the database through the Supabase Data API; BookingsModule connects to the same
database through TypeORM. Both features use the project's Realtime service.

The running demo uses the retained `keyloop-inventory-local` project (Data API
55321, PostgreSQL 55322). Existing scheduler data and TypeORM migration history
were copied into it after restoring and comparing both backups. The former
scheduler stack is stopped with recoverable storage retained. See the
[database merge runbook](database-merge.md). Booking and auth tables now share the exposed `public` namespace, but RLS and
explicit grants prevent browser access; migration history also denies browser roles.

| Component | Role |
| --- | --- |
| React frontend | Provides all staff and guest routes in `apps/web`. React Router keeps the admin navigation mounted while switching `/admin/*` scenarios and lazy-loads guest pages outside that layout. |
| Guest booking feature | Provides `/appointments`, its `/availability` alias, and `/appointments/monitor` inside the same frontend. It handles the customer calendar, service selection, availability checks, and booking confirmation. Creation uses a retry-stable UUID idempotency key. |
| Shared UI package | Supplies the Keyloop theme and reusable tables, dialogs, inputs, calendars, and other interface components. It is a build-time dependency, not a network service. |
| Local Vite proxies | All default to the same `INVENTORY_API_ORIGIN`. `/api` forwards feature/auth requests and `/booking-api` forwards staff booking requests with the browser JWT. Public booking endpoints also use `/api`; staff access is enforced by the backend guard. |
| Better Auth and React session provider | Authenticate staff with email/password, keep an HTTP-only session cookie for renewal, and issue five-minute JWT access tokens held only in browser memory. Login/logout clear cached staff data. |
| NestJS JWT and role guard | Verify signature, issuer, audience and expiry, then read the current session and role. Admin accesses all modules; Technician accesses every booking feature, including rescheduling. Explicit guest endpoints remain public. |
| Unified NestJS API | Hosts Inventory, Leads, Documents, and Bookings as feature modules in one application. A shared bootstrap loads configuration, validates DTOs, configures CORS, and closes resources on shutdown. |
| BookingsModule | Owns guest and admin booking endpoints, scheduling rules, resource allocation, and transactional writes inside the same API process. Its scheduler database configuration is required at startup. |
| Shared Supabase PostgreSQL database | Persists all application tables in `public`, with RLS and grants protecting bookings, unified identities, sessions and signing keys. Customers, staff and technicians share `users`, with explicit roles. `vehicles` stores inventory; `booking_vehicles` stores customer service vehicles. This is one database used by both storage adapters. |
| Supabase Data API | Exposes the inventory/lead table operations and inventory database functions used by the main API. Appointment transactions use a direct PostgreSQL connection through TypeORM. |
| Supabase Realtime | Delivers empty inventory invalidations and date-only appointment availability Broadcasts from the shared project. |
| Mock Sales and Service APIs | Simulate two document systems with different response formats. They return fictional documents over real local HTTP requests. |

Appointment Broadcast bodies contain only the date; inventory bodies are empty; this Supabase version
adds a generated message UUID as transport metadata. It contains no customer
or booking identifiers. Realtime messages prompt an authoritative HTTP refetch. They do not replace
database reads, confirm a save, or reserve appointment capacity.

## 2. Appointment Scheduler

![Appointment Scheduler architecture](architecture/appointments.svg)

Customers select a service and available start time. Staff manage the same
persisted bookings through a day/list dashboard. Both interfaces use the same
booking service and resource-allocation rules.

| Component | Role |
| --- | --- |
| Guest calendar and booking form | Load opening hours, services, calendar entries, and available hourly starts; collect customer and vehicle details; submit a booking and display confirmation or a recoverable error. |
| Staff booking dashboard | Loads the catalog and selected day's bookings. Supports creation, rescheduling, cancellation, and permitted status changes; submits the expected booking version when editing. |
| Guest and admin REST controllers | Validate requests and expose the two API contracts. Guest routes return limited public fields; admin routes return the booking details needed for management. |
| Staff JWT/role guard | Requires a valid JWT and current unrevoked session. Admin and Technician can manage all bookings; permission comes from the current database role. Shared booking keys are no longer used. |
| Schedule rules and resource matcher | Apply dealership timezone, opening hours, service duration, and technician qualifications. Query free qualified technicians and bays using SQL `NOT EXISTS` checks over overlapping bookings. |
| Booking service and TypeORM connection | Execute booking writes in a single PostgreSQL transaction. Lock the existing technician user and bay rows, recheck booking occupancy, then persist the booking. Reuse the allocator for rescheduling; validate versions and legal status transitions for admin edits. |
| Protected booking tables in public | Stores unified user profiles, customer vehicles, service types, technician qualifications, bays, and bookings in the shared database. Constraints preserve relationships; resource locks coordinate booking writers. RLS and revoked browser grants protect booking tables in the shared public namespace. |
| Availability trigger and Realtime Broadcast | Publish `availability_changed` after committed changes, scoped to dealership-local dates. The application payload contains the date; clients refetch affected data without broadcasting customer or booking details. |

Availability previews do not reserve resources. The transaction makes the final
allocation decision, and all booking writers must follow its resource-row locking
protocol. The current appointment model uses 60-minute services and whole-hour
starts; availability is queried directly from bookings without bitmaps or a cache.

**Implementation references:** Main workspace:
[`booking-api.ts`](../apps/web/src/admin/booking-api.ts),
[`useAdminBookings.ts`](../apps/web/src/admin/useAdminBookings.ts), and
[`watch-bookings.ts`](../apps/web/src/admin/watch-bookings.ts).
The main workspace also contains the [guest booking feature](../apps/web/src/booking/),
[BookingsModule](../apps/api/src/bookings/bookings.module.ts), and
[scheduler connection, migrations, and seed](../apps/api/src/database/).

## 3. Intelligent Inventory Dashboard

![Intelligent Inventory architecture](architecture/inventory.svg)

Managers browse inventory, filter and sort across the complete dataset, identify
stock older than 90 days, and save a current action with an optional note.

| Component | Role |
| --- | --- |
| Inventory dashboard, table, and action dialog | Display summary cards, filters, ordered sort keys, cursor navigation, vehicle details, and action editing. Aging means more than 90 dealership-local calendar days in stock. |
| TanStack Query and inventory API client | Fetch and validate pages and independent metadata, cache by query, cancel superseded requests, and retain previous rows during refreshes. TanStack Table uses manual server filtering and sorting. |
| Inventory controller and service | Expose inventory pages, metadata, individual vehicle reads, and action updates. Validate query/cursor/action inputs, supply dealership dates, and translate database failures into API errors. |
| Supabase Data API | Carries server-side table reads and PostgreSQL function calls using a service-role credential held by NestJS. Browser code receives only the public connection configuration used for Realtime. |
| Inventory table and functions in Supabase PostgreSQL | Store vehicle facts and the current action in the shared database. `inventory_page` applies filtering, ordered sorting, and cursor pagination; `inventory_metadata` calculates global counts and make/model options. `save_inventory_action` locks the vehicle, checks age and expected version, and atomically updates the action. |
| Supabase Realtime and subscription hook | Receive `inventory_changed` Broadcasts with no row payload. Browser roles have no direct inventory SELECT. Coalesce notifications and invalidate page/metadata queries; refetch on subscription and reconnection. Dealership midnight also refreshes age-dependent results. |

The database processes the full dataset before returning a page. A stale edit
returns a conflict instead of overwriting another manager's action. Only one
current action is stored per vehicle; it is not an action-history system.

**Implementation references:**
[`inventory API`](../apps/api/src/inventory/),
[`inventory UI`](../apps/web/src/admin/inventory/),
[`inventory schema`](../supabase/migrations/20261021000100_inventory.sql), and
[`query functions`](../supabase/migrations/20261022000100_inventory_query.sql).

## 4. Sales Lead Management

![Sales Lead Management architecture](architecture/leads.svg)

Staff browse enquiries, inspect customer and vehicle-interest details, and add
follow-up notes to a chronological activity history. Initial website enquiries
are seeded fictional records; live website ingestion is not implemented.

| Component | Role |
| --- | --- |
| Lead inbox and detail panel | Load cursor-paginated lead pages with a Load more control and the selected lead, show contact/enquiry details and chronological activities, and distinguish loading, empty, and error states. |
| Activity dialog and leads API client | Validate responses and submit a note with a client-generated activity UUID. Retain the draft and reuse its UUID when retrying an uncertain save. |
| Leads controller | Expose list, detail, and activity-creation endpoints; validate route IDs and submitted activity fields before invoking the service. |
| Leads service | Read leads and history and append activities through the Supabase Data API. Treat an identical repeated activity ID as a successful retry; reject conflicting reuse of the ID. |
| Lead and activity tables in Supabase PostgreSQL | Persist `sales_leads` and `sales_lead_activities` in the shared database. Foreign keys associate notes with leads, UUID primary keys prevent duplicate activities, and database timestamps establish saved history. Browser roles have no direct access to these tables. |

Successful saves update the visible history from the API response. This scenario
uses request/response updates; it has no Realtime subscription. It shares the
inventory Supabase configuration and the same database as appointments.

**Implementation references:**
[`leads API`](../apps/api/src/leads/),
[`leads UI`](../apps/web/src/admin/leads/), and
[`lead tables`](../supabase/migrations/20261021000300_sales_leads.sql).

## 5. Unified Document Viewer

![Unified Document Viewer architecture](architecture/documents.svg)

Staff see one document list across Sales and Service, optionally filter by VIN,
and open a readable preview without leaving the dashboard.

| Component | Role |
| --- | --- |
| Document list, VIN search, and preview | Request all documents or a VIN-filtered result, display source labels and partial-result warnings, and render fictional document content as plain React text in a dialog. |
| Documents API client | Validate the aggregated response and source metadata; abort or ignore superseded searches so an older response cannot replace the current result. |
| Documents controller and aggregation service | Validate/normalize the search and load configured sources concurrently using `Promise.allSettled`. Merge and sort successful results and return per-source status/counts. Return partial results if one source fails, or a safe gateway error if all fail. |
| Document sources HTTP client | Forward the current Admin JWT to each configured loopback source with a three-second timeout and reject redirects. Mock sources enforce the same Admin permission. Keep HTTP transport separate from aggregation and source-specific field mapping. |
| Adapter factory, source adapters, and normalizer | Resolve a registered Sales or Service adapter, build its request path, map its payload to a shared document shape, validate fields, and namespace document IDs by source. |
| Mock Sales API | Return fictional sales documents using its own payload format from `/mock/sales/...` endpoints in the main NestJS process. |
| Mock Service API | Return fictional service documents using a different payload format from `/mock/service/...` endpoints in the same process. |

This scenario aggregates source responses on demand. It does not persist a
document copy, use object storage, or connect to production document systems.
Registering another adapter and source URL extends the aggregation path; source
labels and status metadata drive the existing UI.

**Implementation references:**
[`document API and adapters`](../apps/api/src/documents/) and
[`document UI`](../apps/web/src/admin/documents/).

## 6. End-to-end data flow

### Request entry and staff access

1. React Router selects a staff screen under `/admin/*` or a public guest booking
   page. In local development, Vite strips `/api` or `/booking-api` and forwards the request to the unified NestJS API. These
   proxies are development configuration; a deployed frontend would need an
   equivalent routing setup.
2. Staff sign in through `/api/auth/*`. Better Auth stores identities and sessions
   in protected `public.users` and auth support tables and sets an HTTP-only session cookie. The frontend obtains a
   five-minute JWT through that session and keeps it in memory.
   `authenticatedFetch` attaches the bearer token to feature requests and tries
   renewal once after a 401. Login/logout clear cached staff data.
3. The global staff guard verifies the JWT and queries the current database
   session and role before allowing access. Admin can use all scenarios;
   Technician can use staff bookings. Guest controllers explicitly bypass staff
   authentication and expose only their public contracts. Controllers and
   services validate inputs before performing feature operations.

The browser's Supabase public configuration is used for Realtime subscriptions,
not direct access to business tables. Inventory/lead Data API credentials and
direct PostgreSQL credentials stay in the API process.

### Feature reads, writes, and responses

| Scenario | End-to-end path |
| --- | --- |
| Appointments | Guest pages fetch schedule, services, and anonymous monthly calendar entries (`GET /bookings?month=YYYY-MM`) through `/api`. The form queries `GET /availability?serviceTypeId=...&startsAt=...` after selecting a time, receiving free qualified technicians and free bays from SQL. The standalone monitor still uses the preview API; staff fetch catalog and day records through `/booking-api/admin/bookings`. A confirmation `POST /bookings` with an idempotency key enters `BookingsService`, validates dealership-local hours and service qualifications, checks the guest-selected technician/bay using SQL overlap checks, locks their existing resource rows, and rechecks availability in one TypeORM transaction. Customer/vehicle records and the booking commit together. Staff reschedules (`PATCH /admin/bookings/:id`) and cancellations use the same transaction path and expected booking versions. The HTTP response supplies the saved result; the staff query cache refetches the affected day. |
| Inventory | The screen sends filters, ordered sort keys, page size, and an optional cursor to `/api/inventory`, and requests metadata separately. NestJS validates them and calls `inventory_page`/`inventory_metadata` through the Supabase Data API. PostgreSQL processes the complete dataset and returns a page plus global summary/options. The API maps rows and adds cursor/date information; TanStack Query caches the result by query. An action PATCH includes `expectedVersion`; `save_inventory_action` locks/checks the row and age rule, updates atomically, and returns the saved vehicle. Stale versions return 409 rather than overwrite another edit. |
| Leads | `/api/leads?limit=50&after=<cursor>` returns lead pages with `nextCursor`; `/api/leads/:id` reads the selected enquiry and saved activity history through the Data API. Adding a note sends a client-generated UUID to the activity endpoint. The service inserts the note, or returns the existing activity for an identical UUID retry; conflicting reuse returns 409. The UI uses the saved response to update history. There is no live website ingestion or lead Realtime feed. |
| Documents | `/api/documents` carries an optional VIN. The API normalizes it and concurrently fetches Sales and Service over loopback HTTP, forwarding the Admin JWT. Each adapter validates and maps its source format; aggregation sorts the shared document records and returns source statuses/counts. A failed source produces partial results and a UI warning; all sources failing produces 502. Previews render returned fictional content as text; no document is copied into PostgreSQL or object storage. |

The public monthly calendar returns only appointment times and service labels.
Selected-time availability loads the service duration, validates hours, then uses
one resource SQL statement returning both named lists. `NOT EXISTS` excludes any
non-cancelled booking overlapping the requested interval; technician role,
qualification and banned-state checks determine eligibility. Existing B-tree
indexes remain available; no GiST, bitmap, or persisted availability cache is added.
The compatible day preview applies the SQL to a set of generated starts in one
query. The guest modal requires explicit technician and bay choices, cancels stale
requests on time/service changes, and refreshes its selected interval on date
invalidations and focus. Read failures disable confirmation. Idempotent uncertain
retries retain the original choices even if the booking committed or its start
passed. Preview results reserve nothing; POST rechecks the exact pair under locks.

Booking occupancy is stored only in `public.service_bookings`. Writes use READ
COMMITTED transactions and lock the union of previous/next technician user IDs in
sorted order, followed by bay IDs in sorted order, using `FOR UPDATE`. After any
wait, the allocator rechecks the exact selected pair using a fresh booking read;
it never substitutes an unlocked resource. An unavailable candidate rolls back
and retries allocation, up to three attempts. Deadlocks and lock timeouts also
retry; exhausted contention returns 503. Stale booking versions and unavailable
capacity return 409. Status changes lock their current resources before updating.

The SQL reads actual intervals overlapping the requested time range, including
legacy appointments crossing midnight. No persisted occupancy counters remain. Unrelated resources can proceed concurrently; writes sharing a
technician or bay serialize even across different hours/dates. All booking writers
must use this protocol; arbitrary direct SQL writes bypass its guarantees.

Creation also claims a private `public.booking_requests` row, scoped by guest or staff identity and a UUID idempotency key. The request fingerprint and original response commit in the booking transaction. Identical concurrent/restarted retries replay that response; changed payloads with the same key return 409, and failed transactions release the claim. Creation advertises `/admin/bookings/:id` in `Location`. Only staff can read that URL; guests retain the limited confirmation response. See the [REST API reference](rest-api.md).

### Changes reaching other browsers

After committed inventory or booking changes, database triggers publish
Broadcast invalidations through Supabase Realtime over WebSocket. Inventory
events have no business payload; availability events carry only the affected
dealership date. Subscribers coalesce events and refetch through the same HTTP
API, so staff authorization and response shaping still apply. Subscription and
reconnection also trigger refetches; inventory refreshes age-dependent results at
dealership midnight. Realtime is a freshness signal, not a durable event queue
or proof of a successful write. A disconnected client can show stale data until
it refetches; the database transaction remains authoritative.

**Implementation references:**
[`Vite proxies`](../apps/web/vite.config.ts),
[`authenticatedFetch`](../apps/web/src/auth/authenticated-fetch.ts),
[`staff guard`](../apps/api/src/auth/staff-auth.guard.ts),
[`session verification`](../apps/api/src/auth/staff-auth.service.ts),
[`booking transactions`](../apps/api/src/bookings/bookings.service.ts), and
[`resource locks`](../apps/api/src/bookings/resource-locks.ts).
The scenario sections link the remaining feature paths.

## 7. Technology choices and tradeoffs

These choices support the implemented local demo; they do not imply that it has
been deployed or load-tested as a production service.

| Technology or boundary | Why it fits this implementation and its tradeoff |
| --- | --- |
| React, TypeScript, and React Router | Four interactive scenarios share one admin shell, session provider, and UI package; route changes preserve navigation while guest pages use a separate layout. TypeScript checks local contracts, but HTTP and source payloads still need runtime validation. Vite supplies the local server/proxies and frontend build, not production ingress. |
| Shared UI package, Tailwind, and Radix primitives | Reusable tables, calendars, dialogs, and inputs keep the scenarios visually consistent and reuse focus/keyboard behavior. This avoids separate component implementations for each scenario; application labels, focus restoration, and responsive behavior still need verification. |
| TanStack Query and Table | Query handles request caching, invalidation, cancellation, and mutation refreshes for inventory and staff bookings. Inventory keeps previous rows while fetching, and Table delegates sorting/filtering to the server so results cover all stock. The cache can be stale; writes and capacity decisions remain server responsibilities. |
| NestJS modular API | Controllers, injected services, global validation, and a shared staff guard keep HTTP, business rules, and storage boundaries inspectable. One process is sufficient for four demo scenarios and avoids interservice deployment overhead. Its modules share process capacity and failure impact; the document HTTP mocks are not independent services. |
| Supabase PostgreSQL and two access paths | Relational keys, constraints, functions, and transactions fit vehicles, lead history, and resource allocation. One database avoids cross-database consistency work. Supabase's Data API serves inventory/lead operations, while TypeORM provides explicit transactional SQL for scheduling. Maintaining both adapters and migration paths adds coordination; private schemas and server-held credentials preserve the access boundary. |
| Supabase Realtime Broadcast | Existing database triggers can notify other browsers without a custom WebSocket server. Small invalidations avoid broadcasting customer records and reuse authorized HTTP reads. Reconnection/refetch handling is necessary, and broadcasts add no reservation or durable-delivery guarantee. |
| Better Auth, JWT, and current-session checks | Better Auth supplies password/session management; short-lived in-memory JWTs authorize feature requests. Looking up the session and role on each request makes revocation and permission changes effective without waiting for token expiry. It adds a database dependency to every protected request and needs capacity testing before scaling. |
| TypeORM transactions and Luxon | Explicit SQL, ordered resource row locks and post-lock rechecks make booking concurrency inspectable; `synchronize: false` keeps schema changes in migrations. Luxon and configured dealership hours handle local dates and timezone transitions. All booking writers must follow the locking protocol. Writes sharing resources serialize; availability previews reserve nothing. |
| HTTP source adapters and `Promise.allSettled` | Sales and Service have different formats, so adapters normalize them behind one document contract. Concurrent requests with three-second timeouts bound source waits and preserve partial results. Loopback mocks exercise transport and failure handling, but do not prove compatibility, credentials, or resilience against real dealer systems. |
| pnpm workspace, Turborepo, and Vitest | Workspace dependencies reuse the UI and keep web/API builds and checks together; Vitest supports unit, component, and HTTP tests, with separate database integration checks. These support repeatable development, not runtime monitoring or proof that production infrastructure exists. |

Dependency declarations are in the [web](../apps/web/package.json),
[API](../apps/api/package.json), and [root](../package.json) manifests.

## 8. Observability strategy

### Implemented diagnostics and their limits

The API bootstrap uses NestJS's default logger and exception handling. It has no
custom structured request logger, request correlation middleware, metrics
endpoint/exporter, or distributed tracing setup. Expected HTTP exceptions are
returned to callers; that does not mean each failure is recorded as an
operational event. Inventory/lead storage errors are often translated into safe
503 responses without retaining the underlying error in a dedicated log.

Frontend hooks expose request errors, pending/stale data, last-update information
for inventory, and Realtime connection state. Booking subscription cleanup can
emit a browser console warning. Documents expose per-source availability/counts
in the response and partial-result warnings in the UI. These help a person
diagnose the local demo, but are not centrally collected telemetry or alerts.
Stock summary cards and lead activity history are business data, not operational
metrics or a security audit trail.

The root `GET /` returns `Hello World!`; it is only a basic process-response
check, not a database, auth, Data API, or Realtime readiness probe. Scheduler
database configuration/connection is required at startup, but this does not
continuously test every dependency. TypeORM has `logging: false`, and the shared
Supabase configuration has analytics disabled. NestJS Observe and OpenTelemetry
are not installed. Saved browser, concurrency, and benchmark reports under
`exports/` are point-in-time verification evidence, not a monitoring service.

**Evidence in source:**
[`bootstrap`](../apps/api/src/main.ts),
[`root response`](../apps/api/src/app.service.ts),
[`database options`](../apps/api/src/database/connection-options.ts),
[`Supabase config`](../supabase/config.toml),
[`inventory state`](../apps/web/src/admin/inventory/useInventory.ts), and
[`booking subscriptions`](../apps/web/src/admin/watch-bookings.ts).

### Proposed deployment work — not implemented

| Signal | Instrumentation and use |
| --- | --- |
| Structured logs | Add request completion and error logging at the API boundary with timestamp, severity, service/version, generated request ID, route template, method, status, and duration. Preserve safe internal failure categories for storage/source errors while returning safe messages to users. Record booking contention/retry exhaustion and document-source failures explicitly, including degraded HTTP 200 responses. Collect stdout in a central log store with access and retention controls. |
| Metrics and dashboards | Measure request volume, status classes, and latency by route; database pool pressure/query duration; booking allocation retries/exhaustion, lock waits and conflicts; Data API errors; per-document-source latency, timeouts, and partial/all-source failures. Add browser error and Realtime disconnect/refetch-failure measurements to detect stale clients. Keep labels bounded to route, operation, source, and outcome, rather than customer or record IDs. |
| Traces | Introduce OpenTelemetry instrumentation for inbound NestJS HTTP, auth/session database checks, TypeORM/pg operations, Data API HTTP calls, and document source calls. Add spans for allocation attempts and source normalization where automatic instrumentation cannot explain the delay. Propagate trace context on supported HTTP hops and export sampled traces through a collector. Database-triggered Broadcasts are asynchronous; do not claim their events already share the originating request trace. Measure reconnect/refetch recovery separately. |
| Health and alerting | Add separate liveness and bounded readiness probes for required database/auth/Data API paths, with safe responses. Monitor Realtime independently. Dashboard availability, latency, errors, and dependency saturation together; alert on sustained failures/latency, repeated booking retry exhaustion, document-source outages, and prolonged refresh failures. Set thresholds from measured baselines and agreed service objectives. Treat expected validation/409 conflicts separately from server failures. Link alerts to logs/traces and a dependency-specific recovery runbook. |

Customer names, email/phone, VIN/registration, lead notes, document content,
passwords, bearer tokens, cookies, and service-role/database secrets must not be
captured in logs, spans, metric labels, or browser reports. Use route templates
instead of raw URLs/query strings, disable body/header capture by default, and
apply redaction before exporting telemetry. Restrict dashboard access and define
retention before collecting real customer data.

Validate this proposed setup in a deployment environment by injecting a Data API
failure, document-source timeout, concurrent booking contention, and Realtime
disconnect. Check that the UI behavior, safe correlated logs, metrics, traces,
and alerts agree, and that recovery is visible without exposing private data.
Existing [database checks](../exports/shared-database-checks.json) and
[booking concurrency checks](../exports/booking-locks-e2e-results.json) remain
local functional evidence; they do not verify this proposed observability stack.

## Implementation boundary

These diagrams document the implemented local demo: one frontend, one NestJS
API, and one shared Supabase PostgreSQL database. Inventory, Leads, and
Appointments retain their persisted fictional data; Documents uses HTTP mocks.
Better Auth supplies staff JWT authentication and current-role/session checks.
Browser roles cannot read inventory, leads, scheduler records or auth tables
directly. See [authentication and RBAC](authentication.md) for the permission
matrix, JWT flow, provisioning, and deployment limits.

Consolidation checks covered application row hashes, access permissions, and
both Realtime paths. The [saved verification report](../exports/shared-database-checks.json)
records this local run; it is not a production readiness claim.

The [diagram sources](architecture/) are editable Graphviz `.dot` files alongside
their rendered SVGs. The diagrams use logical component boundaries; a box does
not imply a separate deployment unless stated above.

### Unified user identity

`public.users` is the sole application identity table. Its text IDs preserve both existing staff IDs and UUID customer/technician IDs. Roles distinguish customers, technicians and admins. The separate `technicians` and Better Auth `user` tables are removed by a forward migration. Bookings retain separate `user_id` (customer) and `technician_id` (assigned worker) references to users. Qualifications also reference users; booking occupancy is derived from service_bookings. Availability requires a non-banned user with technician role and the matching service qualification. Existing appointments remain linked even if a user later changes role. Better Auth uses the same users through its model-name mapping; credentials and sessions stay in their existing support tables.
