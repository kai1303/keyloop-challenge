# Direct SQL resource availability

**Requirement:** Query free qualified technicians and free bays for the selected service/time instead of constructing bitmaps.

**Design:** Extend existing `GET /availability?serviceTypeId=...&startsAt=...` with named technician/bay lists. Use parameterized `NOT EXISTS` overlap checks against non-cancelled `service_bookings`, with service qualifications and unbanned technician roles. Reuse the SQL for allocation and the exact post-lock recheck, excluding the current booking during reschedules. Preserve staff auto-assignment, mandatory guest choices, ordered resource locks, versions, and idempotency.

Keep bulk `/availability/slots` compatible through the same SQL CTE over generated candidate starts, without per-slot round trips. Monthly `/bookings` becomes `{month, bookings}` with only anonymous times and service names, as it now serves calendar display alone. The form requests selected-time resources on change and date-scoped Realtime/focus refreshes, aborts stale requests, fails closed on errors, clears unavailable selections, and preserves exact uncertain retries. No frontend or backend bitmap remains. Time choices reflect working hours; capacity is checked when a time is selected rather than prefetching capacity for every start.

- [x] Add failing resource-query tests, then implement SQL and update allocator tests.
- [x] Replace frontend bitmap computation with selected-time fetches; update race, retry, live refresh, and selection tests.
- [x] Remove obsolete matcher code/tests, update docs/contracts, and run builds and appropriate suites.
- [x] Verify live query results and request behavior; save screenshot/evidence without creating live bookings.

Work inline, preserve unrelated dirty changes, no migrations/dependencies/deployment.

**Verification:** Web 186 passed / 3 skipped; API unit 114 passed; HTTP 78 passed; guarded PostgreSQL integration 80 passed. API/web builds and API typecheck/lint passed. Removed bitmap-specific unit tests with the deleted matchers; PostgreSQL tests cover qualification, capacity, adjacent and legacy intervals, cross-midnight bookings, split-resource intervals, cancellation, exact selections, retries and concurrency. Live selected-time lists matched independent SQL for both services at 11:00 and 12:00 UTC. One HTTP resource request followed each selected time; one date-only Broadcast refreshed the calendar and selected-time resources once each. No live booking submitted.
