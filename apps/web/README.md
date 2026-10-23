# Keyloop web app

Run `pnpm --filter @keyloop-interview/web dev` from the workspace root.

- `/` displays the existing Keyloop component library.
- `/login` signs in Admin and Technician accounts through Better Auth.
- `/admin/bookings` displays persisted staff booking management for both roles.
- `/admin/inventory`, `/admin/leads`, `/admin/documents` require Admin.
- `/appointments` and `/appointments/availability` display the guest calendar.
- `/appointments/monitor` displays the guest availability monitor.

All routes run from this one frontend. The guest routes sit outside the admin
layout and share the existing Motion provider and UI package. Their lazy-loaded
feature lives in `src/booking`; no second frontend server is required.

Follow the root [setup guide](../../README.md) for the unified API and database setup.
`INVENTORY_API_ORIGIN` selects the unified backend for both proxies.
`BOOKINGS_API_ORIGIN` is an optional legacy override; omit it for the single API.
`/booking-api` forwards the browser’s JWT for staff requests;
Guest booking requests use the shared `/api` proxy; the backend enforces staff-only access. `/api/auth/*` proxies Better Auth. Both guest and staff Realtime use `VITE_BOOKINGS_SUPABASE_URL` and
`VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY`. Set the booking URL to the same
project as `VITE_INVENTORY_SUPABASE_URL` (local port 55321); all browser-safe
keys now come from this one project.

The admin dashboard uses the shared Keyloop fonts, tokens, components and Operate accent. Its sidebar, summary cards, Day/List tabs, booking popovers, forms and tables are composed from the local shadcn components. The resource timeline supplies the custom bay/time geometry; each event is a shared Button and Popover trigger. It includes Day/List views, date/search/status/technician filters, full booking details, guest booking creation, qualified technician/bay allocation, rescheduling/reassignment, cancellation with an optional reason, and confirmed → in service → completed status changes.

Bookings use the main NestJS API's BookingsModule and persist in the private `scheduler` schema of the shared Supabase PostgreSQL
database. Guest and staff changes share the same allocator and date-only
Realtime Broadcasts. Staff API calls require a JWT and current server-side role/session validation. Browsers do not read private customer tables.

Booking opening hours, timezone, services, and resource rosters come from the
unified API. The current catalog has 60-minute services and whole-hour
starts. The server locks and rechecks resources before committing a booking;
UI availability is a preview rather than a reservation.

Checks:

```
pnpm --filter @keyloop-interview/web test
pnpm --filter @keyloop-interview/web typecheck
pnpm --filter @keyloop-interview/web build
```

## JWT authentication

Access tokens expire after five minutes and stay in memory. Better Auth keeps its
session cookie HTTP-only and uses it to renew JWTs. The shared fetch helper renews
once on 401 and deduplicates concurrent renewal. Login/logout/session changes clear
cached staff data. Technician sees Bookings only; NestJS independently enforces
permissions on every staff request.

See [authentication and RBAC](../../docs/authentication.md) for setup and limitations.
No role selector or public signup is exposed.

## Dashboard motion

Motion uses the existing local `LazyMotion` provider and lightweight `motion/react-m` components. The header and board enter with a short fade/slide; summary cards stagger, date/view changes fade in, booking blocks animate position updates and hover/press feedback, and selected customer details transition without retaining outgoing customer controls. Reduced-motion preferences disable these movements and delays. Shared dialogs retain their existing local Motion implementation.

## Booking details

Click a calendar event or a List booking to open its details in an anchored shadcn Popover. There is no persistent details panel below the schedule. Escape, the close button, or an outside click dismisses it; Escape returns focus to the event. Only one booking popover opens at a time. On narrow screens, the popover opens above/below the event, stays inside the viewport and scrolls internally.

Management actions retain their existing dialogs. Closing an edit dialog without saving returns focus to the action in the popover. Successful creation, rescheduling or cancellation closes the popover and announces the result; select the booking to reopen its updated details. Start/complete actions update the open popover immediately.

## Schedule date picker

The schedule toolbar uses the shared shadcn Calendar inside Popover, styled with local Keyloop tokens and a reduced-motion-aware Motion entrance. Picking a day updates the selected schedule and new-booking default date, closes the picker and restores trigger focus. The Calendar uses Asia/Ho_Chi_Minh explicitly; viewing past dates and closed days remains allowed. Previous/next day and Today stay available. Booking-editor date fields keep their existing native Input behavior.

Calendar regression tests cover mouse/keyboard selection, month navigation, closed-day viewing, returned focus and new-booking date defaults. The date tests also pass with host timezones set to America/Los_Angeles and Pacific/Auckland.

## Inventory administration

- `/admin/inventory`: make/model/stock-age/action filters, aging indicators,
  vehicle details, and persisted action editing within the shared admin layout.
- Column menus combine filters and sorting. Add up to three ordered sort keys;
  sort chips show priority and allow removing secondary keys. TanStack Table
  uses manual filtering/sorting: PostgreSQL processes the full dataset before
  returning a page. No client-side sorting of a partial page is used.
- Previous/Next use cursor history; page sizes are 10/25/50/100. Filter, sort
  and page-size changes reset to page 1. Summary cards and make/model choices
  come from an independent metadata query, so they never reflect just one page.
- The footer uses the shared [shadcn Pagination](https://ui.shadcn.com/docs/components/radix/pagination)
  composition with chevrons, an `aria-current` page indicator and an inline
  shadcn Select for page size. Its links render native buttons for cursor
  actions, keeping correct keyboard and disabled behavior without URL reloads.
  Previous/Next become icon-only on small screens and wrap below the selector
  when space is tight. No random page jumps or filtered page counts are implied.
- TanStack Query cancels superseded requests, keys cached pages by the complete
  query and retains previous rows while updating. Action-conflict review reads
  the vehicle by ID. Cursor navigation reflects live data rather than a frozen
  dataset; concurrent edits can move vehicles between pages.
- `VITE_INVENTORY_SUPABASE_URL` and `VITE_INVENTORY_SUPABASE_ANON_KEY` configure
  the local browser subscription. A service-role key must never be browser-side.
- NestJS HTTP reads/writes use the development `/api` proxy. Realtime events are
  invalidation hints; reconnect, visibility restoration, and dealership midnight
  trigger authoritative page and metadata refreshes. Burst events are coalesced
  without reconnecting the subscription when filters change. A stale connection/data warning is
  shown instead of claiming old inventory is live.
- `INVENTORY_API_ORIGIN` can select a different loopback API during isolated
  development, for example `http://127.0.0.1:3006`.
- No runtime sample-data fallback exists. Configure local Supabase before using
  this page. Bookings require the scheduler configuration in the unified API.

Run `pnpm --filter @keyloop-interview/web test`, `typecheck`, and `build`.
Live Supabase checks require the opt-in procedure in the inventory plan; ordinary
unit tests do not prove database persistence or browser WebSocket delivery.

Admin navigation uses React Router `Link` components and a shared layout route.
Switching between Bookings and Inventory updates the page content without a
document reload; the sidebar stays mounted. Resources and Opening hours are
booking toolbar actions. Booking view selections remain route-local; saved bookings and inventory
actions persist in the same Supabase PostgreSQL database, in their feature schemas.

## Sales Leads

`/admin/leads` shares the existing admin navigation. It lists fictional website
leads, opens complete contact/enquiry details and chronological follow-up history,
and saves a new activity through NestJS into local Supabase. Notes survive refresh
and API restarts. A failed save retains the draft; retrying the same note does not
create a duplicate. Dates display in Asia/Ho_Chi_Minh.

Start the configured API, then `pnpm --filter @keyloop-interview/web dev` from the
repository root. The existing `/api` proxy uses `INVENTORY_API_ORIGIN`, defaulting
to `http://127.0.0.1:3000`. To use a separate local API on 3007, run:

```sh
INVENTORY_API_ORIGIN=http://127.0.0.1:3007 pnpm --filter @keyloop-interview/web exec vite --host 127.0.0.1 --port 5177 --strictPort
```

Database setup and test configuration are documented in the API README. This is a
fictional local demo, with no live enquiry ingestion, contact automation or
public deployment. The inbox uses 50-record cursor pages with a Load more control; failed page requests retain earlier rows and the selected lead. Activity history is still returned with the selected lead and needs separate pagination before very large histories.

## Unified Document Viewer

`/admin/documents` adds a VIN search and a single Sales/Service document table
to the shared dark navigation. Document previews use the existing Dialog and
render source content as plain React text. All documents load on mount, with
each vehicle VIN visible. Search explicitly filters by VIN; **Show all documents**
or a blank search resets the list. Superseded requests are aborted and ignored. Partial source warnings, no records and full
failures are separate states.

Use example VIN `1HGCM82633A004352` to see both systems. Frontend requests go
through the existing `/api` proxy. Run focused checks with
`pnpm --filter @keyloop-interview/web test src/admin/documents`.

Document source IDs and labels come from the API's `sources` metadata. The viewer
has no fixed Sales/Service list: registering another backend adapter and URL is
sufficient to include its documents, count, warnings and preview label. Response
validation requires each document's source to exist in that metadata and verifies
counts, source IDs/labels, VINs and document fields before rendering.

Inventory's initial route and data loads share a shadcn Skeleton layout matching
the summary cards and six-column table. Pending loads announce one accessible
status, show no empty-state message or fake stock counts, and keep the heading
visible. Background refreshes retain existing rows and filters. Skeleton pulses
are disabled for reduced-motion preferences.

The skeleton-to-data handoff skips a second entrance fade. Loading and loaded
tables share fixed column widths. Routine refresh/reconnect status lives below
the table in a reserved freshness area, so it cannot push the summary or table
down while Supabase completes its subscription snapshot. Actual load errors
retain their Retry alert.

The loading board also reserves the same 32px title/action toolbar and 16px gap
as the loaded table, including the quick Clear filters action. A browser check
with request latency held at 750ms measured the table handoff moving by 25px
before alignment and 0px afterward. This geometry check is separate from a
Lighthouse or field CLS measurement.

## Booking API routes

The guest calendar reads `/api/bookings?month=YYYY-MM` and creates through `/api/bookings`. Staff reschedules use `PATCH /booking-api/admin/bookings/:id`. Creation sends a UUID `Idempotency-Key`; unchanged uncertain submissions reuse it, while changed payloads or new operations receive a fresh key. The calendar reads anonymous monthly bookings; it no longer downloads resource assignments or builds bitmaps. The form generates future time choices from opening hours, then requests `/api/availability?serviceTypeId=...&startsAt=...` for the selected interval. It displays the SQL-returned free technician/bay lists, with both selections required. Time/service changes cancel old requests and clear selections; late results are ignored. Realtime/focus refreshes each read, and an unavailable selected resource is cleared without substitution. Failed resource reads disable confirmation. Confirmation posts directly to the backend, which checks capacity under locks; uncertain retries retain their key even after the slot fills or its start passes. Keys are held in memory for the current form/hook lifetime. The API returns a guarded staff item URL in `Location`; guests do not gain customer-detail access.
