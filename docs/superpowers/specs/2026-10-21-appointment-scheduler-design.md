# Appointment scheduler design

## Agreed scope

- NestJS backend in `apps/api`, using PostgreSQL.
- One dealership; no dealership selection or separate dealership entity.
- Guest booking with required name, email, and phone number; no login.
- Email is trimmed, lowercased, and unique in the customer table.
- Every technician and bay follows the dealership's opening hours.
- Each service type has a fixed, positive duration in minutes.
- The backend assigns one qualified technician and one bay for the full duration.
- A successful booking persists the customer, vehicle, service, resources, and times.

## Proposed structure

Use one NestJS application with TypeORM and explicit PostgreSQL migrations.
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
Foreign keys enforce the associations. Store booking times as `timestamptz` and
require `endsAt > startsAt`. New bookings have status `CONFIRMED`.
Persist the calculated end time so changes to a service duration do not alter
existing reservations. Vehicle registration alone is the proposed initial vehicle
input; make/model are omitted.

Reuse an existing User by normalized email without overwriting their contact
details. Each booking snapshots the submitted contact details so a repeat booking
retains the contact information provided for that appointment. A guest's email and
registration establish an unverified association, not proof of vehicle ownership
or customer identity. Do not expose existing customer data in booking responses.

## Booking flow

1. Validate the submitted contact details, registration, service type, and desired
   start time. Require a future timestamp with an explicit timezone or UTC offset.
2. Start a PostgreSQL transaction and acquire the dealership-wide transaction-level
   advisory lock shared by every booking confirmation.
3. Recheck that the start time is still in the future after acquiring the lock.
   Read the service duration and calculate the end time on the server. Reject an
   appointment unless its entire interval falls inside opening hours.
4. Select a qualified technician and a bay, both free for that entire interval.
   Use a stable ordering of resource IDs for predictable allocation.
5. If either resource is unavailable, roll back and return `409 Conflict`.
6. Reuse or create the customer and vehicle, insert the confirmed booking, and
   commit. Any failure rolls back all writes. Return the new booking's ID, service,
   registration, start/end times, and status, without existing customer details.

Two bookings overlap when `existing.startsAt < requested.endsAt` and
`existing.endsAt > requested.startsAt`. This allows back-to-back appointments.

The database lock serializes confirmations across API instances and is held until
commit or rollback, covering resource selection and insertion together. A normal
transaction without coordination would allow concurrent requests to choose the
same resources. Availability previews do not reserve capacity; confirmation always
checks again within the transaction.

An alternative is PostgreSQL exclusion constraints with allocation retries. That
allows more concurrent confirmations but requires more conflict/retry handling.
The dealership-wide lock is the proposed simpler approach for this single-location
version. It assumes every booking writer follows this locking protocol; direct
SQL writes that bypass it do not receive the same overlap protection. Revisit
constraints and finer-grained locking if confirmation contention becomes material.

## Opening hours

Configure a required IANA dealership timezone and weekly opening hours, shared by
all resources. Actual hours and timezone must be supplied for the dealership.
The first version supports one same-day opening interval per weekday, with closed
days represented explicitly. Overnight hours, holidays, breaks, and individual
shifts are outside this version. Evaluate opening hours in dealership local time;
compare reservations as absolute timestamps.

## Initial HTTP interface

- `GET /service-types`: list services and durations.
- `GET /availability?serviceTypeId=...&startsAt=...`: return availability for the
  exact requested interval without exposing customer or technician information.
- `POST /service-bookings`: accept name, email, phoneNumber, registrationNumber,
  serviceTypeId, and startsAt; return `201 Created` for a confirmed appointment.

Return `400` for invalid input, past times, or appointments outside opening hours,
`404` for an unknown service type, and `409` when resources cannot be allocated.
Do not add public customer searches, booking lists, contact editing, or access to
past bookings by email alone. Login, email verification, notifications, cancellation,
rescheduling, and frontend integration are outside the initial booking scope.

## Verification required for implementation

- Validation and database uniqueness for normalized customer email.
- Successful persistence with all required associations and submitted contacts.
- Qualification filtering and full-duration availability for both resource types.
- Rejection when only the bay or only the technician is unavailable.
- Back-to-back bookings, enclosing overlaps, closed days, and closing-time bounds.
- Transaction rollback without partial customer, vehicle, or booking records.
- Two concurrent confirmations against real PostgreSQL cannot share an overlapping
  bay or technician; verify separate database connections follow the same lock.
- Existing customer details remain unchanged and are absent from guest responses.
- Build, typecheck, lint, and HTTP tests for the API.

## References

- [NestJS database integrations](https://docs.nestjs.com/techniques/database)
- [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
