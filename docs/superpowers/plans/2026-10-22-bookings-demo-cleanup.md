# Bookings admin sample-data cleanup

User requested cleanup of dummy data on the Bookings admin page.

- Default Bookings admin state is empty, with zero daily metrics and the existing
  empty state in both Day and List views. Removed the Sample data badge.
- Moved the five hardcoded bookings out of the runtime model into a test fixture.
  Existing tests explicitly provide initial bookings; the live route supplies none.
- Kept booking creation, allocation, filters, resource roster and opening hours.
  The footer accurately states that this page resets its changes on reload.
- Scope: main checkout /Users/kai/works/side-project/keyloop-interview, existing
  admin implementation. Other dirty inventory/document work was preserved.
- No PostgreSQL/Supabase data was deleted or changed. This admin page still uses
  session-local state and is separate from the persistent guest booking backend.

Verification: new empty-default test failed before implementation. Afterward,
47 focused booking/model tests passed; full web suite 108 passed / 3 skipped;
web typecheck and production build passed. Existing Node localstorage warning
remains non-fatal. Browser verified zero metrics, no demo records, Day and List
empty states and New booking dialog opening with focus restoration on Escape.
Preview: http://127.0.0.1:5175/admin/bookings
Screenshot: exports/bookings-empty.png
