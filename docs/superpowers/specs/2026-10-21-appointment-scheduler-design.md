# Appointment scheduler design

## Agreed scope

- NestJS backend in `apps/api`, using PostgreSQL hosted by Supabase.
- One dealership; no dealership selection or separate dealership entity.
- Guest booking with required name, email, and phone number; no login.
- Email is trimmed, lowercased, and unique in the customer table.
- Every technician and bay follows the dealership's opening hours.
- Each service type has a fixed, positive duration in minutes.
- The backend assigns one qualified technician and one bay for the full duration.
- A successful booking persists the customer, vehicle, service, resources, and times.
- Supabase Realtime notifies connected booking pages when availability changes.

## Proposed structure

Use one NestJS application with TypeORM and explicit PostgreSQL migrations.
Connect TypeORM to Supabase PostgreSQL using a server-side database connection
string, through a direct connection when networking permits or the session pooler
for an IPv4-only persistent backend. Supabase provides database hosting; NestJS
owns the HTTP API and booking logic. Supabase Auth is not needed for guest booking.

The browser calls NestJS. Keep customer and booking tables in an application schema
not exposed through the Supabase Data API. Do not grant anonymous clients direct
table writes that could bypass the booking protocol. Separate `supabase-js` Data
API calls do not form one TypeORM transaction; all confirmation queries must use
the same transaction's EntityManager and connection. If Data API access is chosen
instead in the future, move the entire atomic operation into one database function
called through RPC.

Keep HTTP validation in request DTOs, booking orchestration in a booking service,
and persistence in TypeORM entities and transaction queries. Avoid an additional
repository abstraction. Seed service types, bays, technicians, and qualifications
for the first version; management screens are outside this scope.

## Data model

| Entity | Fields and relationships |
| --- | --- |
| User | UUID id, name, normalized unique email, phone number |
| Vehicle | UUID id, userId, registrationNumber; unique customer/registration pair |
| ServiceType | UUID id, name, positive durationMinutes |
| ServiceBay | UUID id, name |
| Technician | UUID id, name; many-to-many qualified ServiceTypes through a join table |
| ServiceBooking | UUID id, userId, vehicleId, serviceTypeId, technicianId, serviceBayId, startsAt, endsAt, status, submittedName, submittedEmail, submittedPhoneNumber |

Enforce normalized email with a database check and a unique constraint.
Foreign keys enforce the associations. Booking associations, start/end times, and
status are required (`NOT NULL`). Store booking times as `timestamptz` and require
`endsAt > startsAt`. New bookings have status `CONFIRMED`.
Persist the calculated end time so changes to a service duration do not alter
existing reservations. Vehicle registration alone is the proposed initial vehicle
input; make/model are omitted.

Reuse an existing User by normalized email without overwriting their contact
details. Use `INSERT ... ON CONFLICT DO NOTHING` followed by a lookup to handle
concurrent customer creation, and the same approach for the unique customer/vehicle
pair. Each booking snapshots the submitted contact details so a repeat booking
retains the contact information provided for that appointment. A guest's email and
registration establish an unverified association, not proof of vehicle ownership
or customer identity. Do not expose existing customer data in booking responses.

## Booking flow

1. Validate the submitted contact details, registration, service type, and desired
   start time. Require a future timestamp with an explicit timezone or UTC offset.
2. Start a PostgreSQL transaction at `READ COMMITTED` isolation.
3. Recheck that the start time is still in the future. Read the service duration
   and calculate the end time on the server. Reject an
   appointment unless its entire interval falls inside opening hours.
4. Select a candidate qualified technician and bay, then lock the Technician row
   followed by the ServiceBay row with `SELECT ... FOR UPDATE`. Check that both
   rows still exist and the technician is qualified. After acquiring both locks,
   run a separate query to recheck full-duration booking availability. Always use
   this lock order; order by ID if multiple rows of a resource type are locked.
5. If either resource has become unavailable, roll back and try allocation again
   with fresh candidates. Return `409 Conflict` when no eligible resource pair
   remains, rather than rejecting merely because the first pair was taken.
6. Reuse or create the customer and vehicle, insert the confirmed booking, and
   commit. Any failure rolls back all writes. Return the new booking's ID, service,
   registration, start/end times, and status, without existing customer details.
7. Bound allocation to three total attempts. Retry transaction deadlocks (`40P01`)
   by rolling back and starting a new transaction. Return a retryable `503` if
   repeated contention exhausts this budget. Propagate unrelated database errors.

Two bookings overlap when `existing.startsAt < requested.endsAt` and
`existing.endsAt > requested.startsAt`. This allows back-to-back appointments.

## Preventing double bookings

The recommended approach is pessimistic row locking on Technician and ServiceBay
within a short transaction. Lock the existing resource rows, not existing booking
rows: an empty booking result provides no row to lock. Every writer must acquire
the same resource locks before its final availability check and booking write.

A confirmation sharing either resource waits until the conflicting transaction
ends. Its separate availability query after acquiring both locks sees bookings
committed while it waited, at `READ COMMITTED` isolation. Requests using different
resources may proceed concurrently. Locks are held only for confirmation, not for
the appointment duration; confirmations sharing a resource can briefly block even
when their appointment times differ. Keep external calls outside the transaction.

Availability previews do not reserve capacity. All resource locks, availability
checks, customer/vehicle writes, and booking insertion must use the transaction's
EntityManager. Row locks do not enforce interval non-overlap against SQL writers
that bypass this protocol.

Optimistic resource versions and PostgreSQL exclusion constraints were also
discussed. Versions require conditional writes on both resources and retries.
Two separate GiST exclusion constraints could additionally enforce non-overlap
for each bay and technician against any writer; they remain an optional database
safeguard, not part of the proposed initial row-lock implementation.

A dealership-wide advisory lock was considered and rejected because it serializes
unrelated confirmations and relies on every writer voluntarily taking the lock.

## Opening hours

Configure a required IANA dealership timezone and weekly opening hours, shared by
all resources. Actual hours and timezone must be supplied for the dealership.
The first version supports one same-day opening interval per weekday, with closed
days represented explicitly. Overnight hours, holidays, breaks, and individual
shifts are outside this version. Evaluate opening hours in dealership local time;
compare reservations as absolute timestamps.

## Realtime availability

Use Supabase Realtime Broadcast for sanitized availability-change notifications.
A PostgreSQL trigger on ServiceBooking sends a custom `realtime.send` message
within the database transaction. Only committed changes should reach subscribers;
rolled-back booking attempts must not publish changes. Do not broadcast complete
booking rows through `broadcast_changes(NEW, OLD)`.

Use a topic scoped to the appointment date in the dealership timezone, such as
`availability:2026-10-21`, and an `availability_changed` event containing only the
date. All service types on that date must be refreshed because bays and qualified
technicians can be shared across services. If a later update moves an appointment,
invalidate both its old and new dates.

Customers book without login, so this availability-only feed uses a public channel.
Public messages must never contain names, emails, phone numbers, registration
numbers, customer IDs, booking IDs, or technician details. Customer and booking
tables remain private to NestJS; subscribing to this feed does not grant table
read or write access. Browser configuration uses the Supabase project URL and a
publishable key; server database credentials never go to the browser.

The browser subscribes to its selected date, then fetches current availability
from NestJS once subscription is established. On notifications, it refetches
displayed availability queries, coalescing bursts of notifications. It also
refetches after reconnection, tab focus, or a date/service selection change.
Treat events as hints to refetch, not as authoritative availability or proof of a
booking. This also limits the effect of forged public-channel messages to refresh
requests; client-side refresh coalescing avoids a request per message.

Realtime improves the displayed availability but cannot reserve resources or
prevent simultaneous confirmations. The NestJS transaction must still lock both
resources, recheck availability, and persist the booking. A customer may receive
`409` even if their last displayed availability was free. Never hold a transaction
or row lock while a customer is filling in the form.

## Initial HTTP interface

- `GET /service-types`: list services and durations.
- `GET /availability?serviceTypeId=...&startsAt=...`: return availability for the
  exact requested interval without exposing customer or technician information.
- `POST /service-bookings`: accept name, email, phoneNumber, registrationNumber,
  serviceTypeId, and startsAt; return `201 Created` for a confirmed appointment.

Return `400` for invalid input, past times, or appointments outside opening hours,
`404` for an unknown service type, `409` when resources cannot be allocated, and
`503` when concurrent allocation repeatedly conflicts within the retry budget.
Do not add public customer searches, booking lists, contact editing, or access to
past bookings by email alone. Login, email verification, email/SMS notifications,
cancellation, and rescheduling are outside the initial booking scope.

## Verification required for implementation

Unit tests are required alongside the implementation, not deferred until the end.
Use the API's existing Vitest setup. Test booking rules with controlled time and
mocked database boundaries:

- Calculate end time from the selected service's fixed duration.
- Accept appointments fully within opening hours and reject past times, closed
  days, and appointments extending beyond closing.
- Reject all overlapping interval shapes and allow back-to-back appointments.
- Allocate qualified technicians only; handle a missing technician or bay.
- Normalize email, reuse existing customers without contact edits, and preserve
  the submitted booking contact snapshot.
- Recheck availability after both resource locks, handle a lost candidate, and
  bound retries with the specified `409`/`503` outcomes.
- Propagate unexpected database failures rather than retrying or reporting success.

Use real PostgreSQL integration tests for transaction rollback, concurrent writes,
and lock behavior; mocks do not prove these guarantees. Use HTTP tests for request
validation and response contracts, and live Supabase/browser checks for Realtime.

The complete verification checklist is:

- Validation and database uniqueness for normalized customer email.
- Successful persistence with all required associations and submitted contacts.
- Qualification filtering and full-duration availability for both resource types.
- Rejection when only the bay or only the technician is unavailable.
- Back-to-back bookings, enclosing overlaps, closed days, and closing-time bounds.
- Transaction rollback without partial customer, vehicle, or booking records.
- Two concurrent confirmations against real PostgreSQL cannot share an overlapping
  bay or technician; verify separate connections follow the lock-and-recheck flow.
- Independent resources can be booked concurrently. Lock checks cover both
  same-bay/different-technician and same-technician/different-bay collisions.
- A conflicting allocation retries against fresh availability, respects the attempt
  limit, and distinguishes unavailable capacity from retry exhaustion.
- Concurrent bookings for the same normalized email reuse one customer without
  changing their contact details or leaking database uniqueness errors.
- Existing customer details remain unchanged and are absent from guest responses.
- Two guest booking pages: a confirmed booking causes the other page to refresh
  availability through Supabase Realtime without reloading the page.
- A rolled-back transaction emits no availability event. Events contain no customer
  or booking details, and direct guest access to booking/customer tables is denied.
- Subscription and reconnection fetch current availability; duplicate or untrusted
  public events do not alter local booking records or bypass confirmation checks.
- Build, typecheck, lint, and HTTP tests for the API.

## References

- [NestJS database integrations](https://docs.nestjs.com/techniques/database)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database change subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [PostgreSQL Read Committed isolation](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)
- [PostgreSQL range exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT)
- [PostgreSQL btree_gist extension](https://www.postgresql.org/docs/current/btree-gist.html)
- [PostgreSQL error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)
