# Single Frontend Implementation Plan

**Goal:** Serve guest appointments and all staff scenarios from `apps/web` on one origin.

**Architecture:** Reuse the existing guest booking feature from the appointment
workspace and lazy-load `/appointments`, `/appointments/availability`, and
`/appointments/monitor` outside the shared admin layout. Add a public-endpoint-only
`/guest-booking-api` proxy to the existing appointment API origin, without the
server admin credential. Keep `/api` and `/booking-api` behavior unchanged and
reuse the existing `VITE_BOOKINGS_*` browser configuration for guest Realtime.

**Tech stack:** Existing React Router, Vite, Supabase client, Luxon, Motion, shared UI, and Vitest. No new packages.

## Scope and checks

- [x] Add route tests proving guest pages render outside the admin shell and
  real HTTP proxy tests proving main, guest, and admin paths reach the correct
  backend and guest paths do not inject the admin credential or forward private endpoints.
  Run these before implementation and confirm the missing guest route/proxy failures.
- [x] Copy `apps/web/src/booking/` from the appointment workspace, including its
  calendar, availability, privacy, and date tests. Change only its API prefix,
  browser environment names, and corresponding expectations. Preserve the source workspace.
- [x] Add lazy guest routes and the bounded guest proxy in the main app. Retain
  existing admin routes, API proxy credentials, provider setup, and component showcase.
- [x] Run guest/routing/proxy tests, the full web suite, typecheck, and production build.
- [x] Update root/web READMEs, environment comments, and architecture diagrams to
  describe one frontend; appointment backend and current database topology stay separate.
- [x] Verify the unified server in a browser, review the scoped change, and
  report any runtime verification limits. Preserve unrelated dirty work.

## Verification evidence

- Before implementation: the new guest route tests rendered the component
  showcase, and the guest proxy tests returned the HTML fallback rather than
  public API JSON. Existing staff/main proxy behavior passed.
- After implementation: 157 web tests passed, 3 opt-in live inventory tests
  skipped; TypeScript and production build passed. No new dependency was added.
- Guest logo routing was checked with an assertion that failed before its
  `/appointments` target was fixed.
- Proxy tests run real HTTP requests against separate operations/appointment
  fixtures and isolate their Vite cache in an owned temporary directory.
- Browser guest verification on the existing main preview (port 5176) loaded
  the calendar, API-backed hourly options, and connected Realtime availability.
  The form was closed without submitting a booking.
- Browser staff verification on the same origin loaded persisted bookings and
  connected Realtime. Screenshots and the scoped verification report are saved
  under `exports/unified-frontend-*`. No live booking was created or changed.
