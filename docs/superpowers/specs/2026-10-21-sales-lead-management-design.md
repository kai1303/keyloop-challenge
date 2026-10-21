# Sales Lead Management Tool

Date: 2026-10-21
Domain: Demand
Status: Implemented and verified locally on 2026-10-22

## Goal and scope

Build Scenario C inside the existing admin dashboard: list website enquiries,
open full lead details and a chronological follow-up history, and persist new
activities. The user approved this flow and declined visual brainstorming.

Use fictional seeded website enquiries for the first demo. There is no public
enquiry form or external website integration. Each follow-up is a separate,
append-only record. No scoring, pipeline stages, reminders, automatic calling,
email sending, activity editing or deletion is included.

## Current project and integration

Source inspection established a React/Vite frontend, shared Keyloop UI controls,
and a NestJS starter API. `/admin/bookings` is dispatched by `main.tsx`; `/`
shows the component library. Booking data is currently held in React state.
`SalesHubShowcase.tsx` contains a sample lead table and sample details dialog,
with no activity logging or database persistence. The API currently returns
`Hello World!`. The inventory and appointment specs propose Supabase, but database
integration is not present in the inspected application sources.

Add an exact lazy-loaded `/admin/leads` route, preserving every route present
when implementation starts. Add a Sales Leads navigation item to the admin shell.
Reuse shared Button, Card, Input, Textarea, Label, Badge, Table and Dialog controls.
Keep the component library and its explicitly labelled examples intact.

If inventory work has already introduced an AdminLayout, reuse it. Otherwise,
extract only the existing sidebar and page container into a shared AdminLayout
consumed by bookings and leads. Keep booking resource/hour controls and booking
modal state in the booking feature. Style only the active navigation link as
active. Preserve booking interactions, responsive layout and existing tests.
Feature-specific demo copy must distinguish transient bookings from saved leads.

## Approaches and recommendation

1. React plus NestJS plus Supabase PostgreSQL is recommended. It fits the existing
   application boundaries and other feature designs, and provides durable storage.
2. NestJS with local SQLite would simplify standalone storage, but introduce a
   second database approach alongside the Supabase designs.
3. Browser-only local storage would be smaller but would not demonstrate shared,
   backend-owned persistence and is excluded.

Use the Supabase JavaScript client in NestJS, consistent with the inventory spec.
No browser database client or realtime subscription is needed for this scope.
Do not make this feature depend on implementing the other designs first.

## User experience

The Sales Leads page uses the existing admin typography, colors and layout.
Show an inbox table with customer name, vehicle interest, enquiry summary and
received timestamp, ordered newest first with ID as a stable tie-breaker. A
labelled View action opens that lead. The inbox supports an explicit empty state,
loading state, and a recoverable error with Retry. Pagination and filters are
outside this initial small seeded dataset.

Show selected lead details beside the table on wide screens and below it on
narrow screens. Include lead reference, name, email, phone, vehicle interest,
complete original enquiry, source and received timestamp. Keep long messages
readable with wrapping and preserved line breaks. Use an explicit prompt before
any lead is selected; do not show a previous lead's details while another loads.

The details view shows an ordered activity history, oldest first. Each entry
contains the complete plain-text note and its timestamp. Show a clear message
when there are no activities. Activity timestamps use the dealership timezone
Asia/Ho_Chi_Minh, matching the existing admin design; store absolute instants in
the database.

Log activity opens a labelled dialog containing one required note field, a
Save activity button and Cancel. Trim the note and require 1–2,000 characters.
Reject whitespace-only input. Disable repeat submissions while saving and keep
the selected lead fixed for the lifetime of that dialog. Prevent dismissal while
a save is in progress so a pending request cannot be mistaken for a cancellation.
Cancel before saving discards the draft. After saving succeeds, insert the server
returned record into the selected lead's ordered history, close the dialog,
announce success and restore focus. On failure keep the draft and show an inline
accessible error. A successful write must not be reported as failed merely because
a later read fails.

Use keyboard-accessible View and Log activity controls, table headings, labelled
form controls, dialog focus management, visible focus, reduced-motion support,
and status/error announcements. Tables scroll inside their container if necessary.

## Data model and persistence

Use two feature-owned tables:

| Table | Fields |
| --- | --- |
| sales_leads | UUID id, customer_name, email, phone, vehicle_interest, enquiry, source, received_at |
| sales_lead_activities | UUID id, lead_id foreign key, note, created_at |

All fields are required. The activity ID is a client-generated UUID used as an
idempotency key for one deliberate submission. Store created_at as timestamptz
with a database-generated default; clients cannot choose it. Require a nonblank
trimmed note of at most 2,000 characters at both API and database boundaries.
Foreign keys prevent activities for missing leads. Index activities by lead_id,
created_at and id. Sort equal timestamps by ID for deterministic ordering.

Persist activity records by INSERT, never by replacing the lead's whole activity
array. Concurrent users can append without overwriting one another. Retrying an
ambiguous network failure with the same activity ID and identical lead/note
returns the existing record; a reused ID with different content returns 409.
Keep the submission ID while retrying the same draft; generate a new ID for a
changed draft or a new activity. A database uniqueness constraint must resolve
concurrent retries rather than a check-then-insert race.

Store versioned SQL migration and explicit, repeatable fictional seed data in
the repository. Seed several enquiry types, long messages, leads without
activities and leads with prior activities. Stable seed IDs allow inserts that
do not overwrite saved records. Never reset or reseed the database on ordinary
application startup. Database storage must survive API and database restarts.

## HTTP interface and boundaries

Add a focused leads module to NestJS, preserving existing providers/endpoints:

- `GET /leads`: inbox records, newest first.
- `GET /leads/:id`: full lead and activities ordered oldest first.
- `POST /leads/:id/activities`: accept only `{ id, note }`; return the saved activity.

Return 201 for a new activity and 200 for an identical retry. Validate UUIDs,
object shape, field types and note limits; reject unexpected fields. Return 400
for invalid payloads, 404 for unknown leads, 409 for conflicting reuse of an
activity ID, and a safe unavailable-service response for database failures.
Never accept a client-selected activity timestamp. Render notes as text.

Use a Vite `/api` development proxy to NestJS, preserving existing configuration.
The frontend calls `/api/leads`. Keep API access in a small feature module and
feature orchestration in the leads dashboard. Separate the inbox, detail/history
view and activity dialog where their responsibilities warrant it; do not add
generic repositories, an application-wide state store or a router dependency.

Abort or ignore superseded reads when selecting a different lead or leaving the
page. A slow response for lead A must not replace lead B. A save response applies
only to its target lead. Refreshing and reopening a lead reads authoritative
database state. Cross-browser push updates are outside scope.

## Local configuration and access

Use a local Supabase development instance, aligning with the inventory design.
Reuse a compatible instance if one has been implemented; otherwise use a clearly
identified local project after checking existing ports and services. Do not reset
an existing project or provision hosted infrastructure as part of this feature.

This first version is a single-dealership, fictional-data demo without login.
Bind the frontend and API to loopback, and keep database endpoints local. Enable
row-level security on the lead tables without anonymous read/write policies.
NestJS alone holds the service-role credential. Browser clients access the API,
not Supabase. Do not expose customer records in a public realtime feed.

Keep actual credentials in ignored environment files, provide placeholder examples,
and fail clearly if required configuration is missing. Public deployment and
authenticated salesperson identity require a separate access-control design.
Do not invent a logged-in author in the demo.

## Verification and acceptance

Add API validation and HTTP contract tests for valid notes, blank/oversized notes,
invalid IDs, missing leads and idempotent retries. Exercise a real disposable
database to prove isolation between leads, concurrent append behavior, stable
chronological retrieval and retry uniqueness. Use that isolated test database
only; preserve the developer's normal demo data.

Add focused frontend tests for opening a lead, full enquiry/history rendering,
successful save, failed save preserving the draft, repeated-submit prevention,
and an out-of-order detail response. Run existing booking tests to protect shell
integration. Run workspace tests, type checks and builds with the actual installed
toolchain; report environmental failures explicitly.

For live acceptance, open `/admin/leads`, select lead A, save a follow-up and
refresh. Confirm the note persists and appears only on A, then restart the API
and re-open A to confirm durability. Check an empty history and narrow-screen
layout. Keep source, automated tests, database proof and browser proof distinct.

## Excluded work

Website ingestion, enquiry submission, lead creation/editing/deletion screens,
authentication, salesperson assignment, activity authorship, pipeline management,
activity editing/deletion, reminders, notifications, realtime updates, dashboards
of sales metrics, search/filtering and public deployment are outside this version.
