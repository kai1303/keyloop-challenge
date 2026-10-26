# REST API reference

Paths below are relative to the unified API (`http://127.0.0.1:3006` in the local
runbook). Staff business requests require `Authorization: Bearer <JWT>` and the
current database session/role check. A session cookie alone is insufficient.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | Public | Basic process response, not dependency readiness |
| GET | `/schedule` | Public | Dealership timezone and hours |
| GET | `/service-types` | Public | Bookable services |
| GET | `/bookings?month=YYYY-MM` | Public | Anonymous monthly calendar entries for calendar/availability |
| POST | `/bookings` | Public | Create a booking; limited confirmation response |
| GET | `/availability?serviceTypeId=<uuid>&startsAt=<ISO timestamp>` | Public | Free qualified technicians and bays for one start |
| GET | `/availability/slots?serviceTypeId=<uuid>&date=YYYY-MM-DD` | Public | Preview a day's starts |
| GET | `/staff/me` | Admin, Technician | Verified staff profile |
| GET | `/admin/bookings/catalog` | Admin, Technician | Services, technicians, bays, schedule |
| GET | `/admin/bookings?date=YYYY-MM-DD` | Admin, Technician | Day's private bookings |
| POST | `/admin/bookings` | Admin, Technician | Create with optional resource selections |
| GET | `/admin/bookings/:id` | Admin, Technician | Current booking details; 404 if absent |
| PATCH | `/admin/bookings/:id` | Admin, Technician | Reschedule or reassign |
| PATCH | `/admin/bookings/:id/status` | Admin, Technician | Change status or cancel |
| GET | `/inventory` | Admin | Filtered, sorted cursor page |
| GET | `/inventory/metadata` | Admin | Global counts and make/model options |
| GET | `/inventory/:id` | Admin | Vehicle details |
| PATCH | `/inventory/:id/action` | Admin | Save current action |
| GET | `/leads?limit=50&after=<cursor>` | Admin | Cursor page of lead summaries |
| GET | `/leads/:id` | Admin | Lead details and activity history |
| POST | `/leads/:id/activities` | Admin | Append an activity with a client UUID |
| GET | `/documents?vin=<optional VIN>` | Admin | Aggregated document list |
| GET | `/mock/sales/documents` | Admin | Fictional Sales documents |
| GET | `/mock/sales/vehicles/:vin/documents` | Admin | Sales documents for a VIN |
| GET | `/mock/service/documents` | Admin | Fictional Service documents |
| GET | `/mock/service/vehicles/:vin/documents` | Admin | Service documents for a VIN |

Better Auth separately mounts `/auth/*`, including `POST /auth/sign-in/email`,
`GET /auth/token`, `POST /auth/sign-out`, `GET /auth/jwks`, and its framework/Admin
plugin routes. See [authentication](authentication.md).

## Calendar and selected-time resources

`GET /bookings?month=YYYY-MM` returns `{ "month": "2030-01", "bookings": [...] }`.
Each entry contains only `startsAt`, `endsAt`, and `serviceName`. Non-cancelled
intervals overlapping the dealership-local month are included. The monthly
calendar response no longer includes resource assignments or a resource catalog.

After selecting a service and start time, the modal calls:

```http
GET /availability?serviceTypeId=<uuid>&startsAt=2030-01-03T10:00:00Z
```

The API loads the service duration, validates future time/opening hours, and runs
one parameterized SQL statement returning both free-resource lists:

```json
{
  "serviceTypeId": "<service UUID>",
  "date": "2030-01-03",
  "startsAt": "2030-01-03T10:00:00.000Z",
  "endsAt": "2030-01-03T11:00:00.000Z",
  "available": true,
  "technicians": [{ "id": "<technician ID>", "name": "Technician A" }],
  "bays": [{ "id": "<bay UUID>", "name": "Bay A" }]
}
```

The SQL uses `NOT EXISTS` over non-cancelled bookings overlapping the full
interval: `booking.starts_at < requested.end AND booking.ends_at > requested.start`.
Technicians must be qualified, have technician role, and not be banned. Other
services' bookings count against shared resources. No bitmap or cache is built.
The service lookup and resource statement are two SELECTs per preview request.

Time options come from opening hours. Capacity is queried only for the selected
time; unavailable times are reported after selection rather than prefetching
capacity for every start. Both resource selections are required; there is no
guest auto-assignment. Changing service/time clears the selections and cancels
obsolete requests. Date-scoped Realtime/focus refreshes both calendar and resource
reads. Errors disable confirmation. After an uncertain POST response, check the
calendar or contact staff before another submission. Only resource names/IDs are public; customer and login details stay
private. Confirmation locks and rechecks the exact selected pair using the same
SQL before saving. The compatible `/availability/slots` endpoint runs the SQL over
all generated starts in one resource query for callers needing a day preview.

## Booking writes

Both creation routes require `Content-Type: application/json`. Public creation accepts:

```json
{
  "name": "Guest Example",
  "email": "guest@example.com",
  "phoneNumber": "+84901234567",
  "registrationNumber": "AB-123",
  "serviceTypeId": "00000000-0000-4000-8000-000000000001",
  "startsAt": "2030-01-02T10:00:00Z",
  "technicianId": "00000000-0000-4000-8000-000000000011",
  "serviceBayId": "00000000-0000-4000-8000-000000000021"
}
```

Guest creation requires `technicianId` (a text user ID) and `serviceBayId` (a UUID). Staff creation accepts the same fields optionally. Technician IDs accept existing UUID strings and staff IDs; the UI-only `auto` value must be omitted. Assignment requires a non-banned user with technician role and the service qualification.
Staff may omit either for automatic selection. Guest creation returns 400 for missing or malformed selections. The allocator checks the exact chosen resources and returns 409 if unqualified or occupied, even when another pair is available. Creation returns 201 and
`Location: /admin/bookings/<id>`. This is a staff-only API resource URL, not a
public booking lookup. Guests receive no customer-detail access through it.

Creation has no replay key. A second POST is a new booking attempt; after a timeout
or lost response, check the calendar or staff booking list before submitting again.
The booking transaction either commits the booking and contact records together or
rolls them back together.

`PATCH /admin/bookings/:id` accepts `startsAt`, `expectedVersion` (integer >= 1),
and optional resource UUIDs. `PATCH /admin/bookings/:id/status` accepts `status`,
`expectedVersion`, and optional `cancellationReason`. Status must be `CONFIRMED`,
`IN_SERVICE`, `COMPLETED`, or `CANCELLED`, and the transition must be legal.
Unavailable resources or stale edits return 409. Exhausted transaction
contention returns 503. Read the staff item URL for current state.

## Lead pages

`GET /leads` returns `{ "leads": [...], "nextCursor": "..." }`. The default limit
is 50, the maximum is 100, and `nextCursor: null` marks the end. Send the returned
cursor as `after` for the next page. Ordering is `received_at DESC, id ASC`,
including when timestamps match; the cursor preserves PostgreSQL timestamp
precision. Unknown query fields, invalid limits, and malformed cursors return
400. The existing composite index supports this order. Pages are current reads,
not a snapshot across concurrent edits.

Activity creation continues to accept `{ "id": "<UUID>", "note": "..." }` and
returns 201 for a new note or 200 for an identical retry. Activity history within
lead details remains unpaged; very large histories need a separate contract.

## Local proxy and migration changes

Vite strips `/api` and `/booking-api` before forwarding. Guest booking requests
use the shared `/api` proxy. The backend JWT/role guard protects staff and
item-detail routes. The old `/service-bookings`, `/calendar-bookings`, and
`/admin/bookings/:id/reschedule` routes were removed; external clients must update.

Before starting the changed API, build and apply
`DropBookingRequests1792972800000` using the TypeORM migration command for the
selected database. It drops the obsolete retry-record table without changing
bookings. The [API runbook](../apps/api/README.md) has the commands.
