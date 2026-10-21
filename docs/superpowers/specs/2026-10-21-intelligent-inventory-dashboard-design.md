# Intelligent Inventory Dashboard

Date: 2026-10-21
Domain: Supply
Status: Implemented locally and verified after the user selected inline execution (option 2). Evidence: exports/inventory-browser-checks.json.

## Purpose and agreed scope

Give a dealership manager a real-time overview of vehicle inventory, make stock older than 90 days prominent, and persist a current action for each aging vehicle.

The user selected a working interview demo with seeded vehicles and database persistence, one editable current action rather than action history, WebSocket updates, and Supabase. Visual brainstorming was declined.

Extend the existing Admin Dashboard with an Inventory section. Use its React layout and interaction patterns, shared Keyloop UI components, and NestJS API. Supabase PostgreSQL persists inventory; Supabase Realtime provides WebSocket updates. SSE and periodic polling are excluded.

Default to a local Supabase development stack for this demo. Docker and the Supabase CLI are installed, and the Docker daemon responded during design exploration. The isolated keyloop-inventory-local Supabase stack is running on loopback ports 55321–55323. Hosted infrastructure provisioning and public deployment are outside scope.

## Current code and integration decisions

Source inspection on 2026-10-21 established these existing pieces:

- `apps/web/src/main.tsx` lazy-loads the component library at `/` and `BookingDashboard` at the exact `/admin/bookings` pathname, under shared StrictMode, Suspense, and Motion providers.
- `apps/web/src/admin/BookingDashboard.tsx` owns the admin sidebar, header, three summary cards, filter board, selected-record details, notices, and modal lifecycle. Its booking data is React state initialized by `createDemoBookings`. A refresh observed during implementation planning migrated it to the shared Sidebar family, Card metrics, Tabs, and booking-details Popovers; preserve that newer revision and its Motion transitions.
- `booking-dashboard.css` contains both reusable admin layout rules and booking-specific timeline/status rules. Its current `.admin-nav a` selector styles every link as active, which needs scoping when adding Inventory.
- `BookingSelect.tsx` is already a generic labelled Select wrapper used by `BookingDashboard.tsx` and `BookingEditor.tsx`.
- `BookingDetails.tsx`, `BookingSchedule.tsx`, and `BookingEditor.tsx` demonstrate the established selected-record, Table, Dialog, error-retention, and focus-restoration patterns. Their booking logic is not inventory logic.
- `booking-model.ts` sets the dealership timezone to `Asia/Ho_Chi_Minh` and provides calendar-date helpers. Inventory must use the same dealership date semantics.
- Booking domain and component tests already use Vitest, React Testing Library, user-event, and jsdom. The web package now has a `test` script.
- The actual NestJS module still contains only the starter controller/service. No Supabase dependency, database integration, or browser Realtime client exists in the inspected application code. Appointment backend and Realtime documents describe planned work, not implemented dependencies.

CodeGraph currently indexes only the two workspace YAML files and zero symbols. The application findings above therefore come from direct source inspection. Existing test/browser results documented by the booking work were not rerun during this design revision.

## Manager experience

Add `/admin/inventory` beside `/admin/bookings` in the existing admin navigation. Preserve `/`, the booking route, and all booking workflows. Use the same admin shell, with Bookings and Inventory links and exactly one active navigation item. This replaces the earlier proposal for a standalone `#inventory` screen.

Keep Resources and Opening hours as booking-specific actions. Inventory uses the Supply domain label; Bookings retains Operate. Reuse the existing neutral/primary theme tokens for Inventory rather than labelling the Operate gradient as a verified Supply brand accent.

Keep demo copy accurate per section: bookings remain session-only, while inventory actions persist in local Supabase. Existing pathname routing uses ordinary links, so navigating away from Bookings reloads the app and its unsaved sample changes reset; this feature does not change that storage behavior.

- Header: Intelligent Inventory, Supply domain label, connection status, and last successful data refresh.
- Summary cards: total vehicles, aging vehicles, and aging vehicles with no action. These describe the whole dealership, independent of table filters.
- Aging shortcut: selecting the aging summary applies the over-90-days filter. Include a visible count and text label, not color alone.
- Filters: make, model, and days in stock. Age choices are all, 0–30, 31–60, 61–90, and over 90 days. Filters combine with AND; changing make clears an incompatible model selection. Include Clear filters and a matching-result count.
- Inventory table: vehicle make/model/year, registration, price in GBP, days in stock, current action, and row action. Show all matching seeded vehicles; default order is oldest stock first, with vehicle ID as a stable tie-breaker.
- Aging badge: label vehicles over 90 days as Aging stock. Aging vehicles without an action also show Needs action.
- Details popover: selecting a vehicle opens the same shared Popover pattern now used for Booking details. Show registration, make/model/year, stock date, age, price, current action, note, and updated timestamp. Keep identity visible while reading or editing an action. Adapt positioning and constrain its size to the viewport on narrow screens. Preserve the popover while its action dialog is open.
- Row/detail action: aging vehicles offer Log action or Edit action. Non-aging vehicles show their current action if one exists, but cannot receive new action edits through this workflow. The action opens the existing style of modal form, rather than creating another editing surface.

The layout adapts to smaller screens, retaining vehicle identity and controls. A table may scroll horizontally inside its own container. Use existing labelled controls, accessible table markup, dialog focus management, and reduced-motion behavior.

## Aging definition

Store the date a vehicle entered inventory as `stocked_on`, a PostgreSQL date. Vehicle manufacture year does not determine stock age.

Use the existing dealership timezone, `Asia/Ho_Chi_Minh`. Days in stock is the calendar-date difference between today's dealership-local date and `stocked_on`, independent of the browser or database host timezone. Exactly 90 days is not aging; 91 days is aging. Reject future stock dates when seed data is prepared. Date-only values may be converted to UTC day ordinals for subtraction, but the definition of today is dealership-local.

The API returns the dealership timezone, server time, and current dealership-local date with each inventory snapshot and calculates aging consistently for responses and save validation. Refresh an open dashboard at the next dealership-local date boundary and when the tab becomes visible again, so aging changes without a database mutation. This date refresh is separate from WebSocket updates; there is no periodic inventory polling.

## Action logging

Use the shared Dialog, Select, Textarea, Button, Label, and Badge components.

Managers select one of these current actions:

- Price Reduction Planned
- Marketing Push Planned
- Wholesale Review Planned
- Monitor Stock

An optional plain-text note allows more detail, including another proposed action. Trim notes and limit them to 1,000 characters. Require a valid action; an empty action is stored as null only for vehicles that have not yet been actioned.

Save the current action, note, server-generated updated timestamp, and incremented version. Show the saved state only after persistence succeeds. Close the dialog on success; keep the draft and show an accessible inline error on failure. Cancel discards unsaved edits.

This is one current record per vehicle. There is no history, task execution, automatic repricing, or claim that a planned action has been completed.

## Architecture and data boundaries

### React dashboard

Add a focused inventory feature under `apps/web/src/admin/inventory`, reusing the shared UI package and the existing admin chrome. Keep inventory state and subscription lifecycle in this feature rather than adding behavior to generic UI components or booking state.

Extract only the parts that now have two real consumers:

- `admin/AdminLayout.tsx` and `admin/admin-layout.css`: move the existing sidebar, main container, and common responsive layout rules out of `BookingDashboard.tsx`/`booking-dashboard.css`. Accept the active page, page-specific sidebar actions, and accurate demo copy. Keep booking modal handlers in `BookingDashboard`; keep timeline and booking status styles in their current feature stylesheet.
- `admin/AdminSelect.tsx`: promote the existing generic `BookingSelect` wrapper, preserving its labels, disabled state, and option contract. Update its current consumers in `BookingDashboard.tsx` and `BookingEditor.tsx`, then use it for inventory filters/action selection. Do not duplicate the wrapper or redesign the underlying shared Select.
- `admin/dealer-date.ts`: move the existing timezone and `dealerDate` helper into a small domain-neutral module, then update booking imports/tests as needed. Reuse the same calendar-date definition for inventory without importing its model from the booking domain. Keep booking scheduling/resource rules in `booking-model.ts`.

Add an exact, lazy-loaded `/admin/inventory` branch to `main.tsx` using the existing pathname dispatch. Preserve all other branches present at execution time. No router dependency, new shell theme, generic navigation framework, or redesign of the component showcase is needed.

Use `InventoryDashboard.tsx` for inventory state and orchestration, `InventoryTable.tsx` for list rendering, `InventoryDetails.tsx` for selected-vehicle context, and `InventoryActionDialog.tsx` for persistence feedback and draft handling. Keep pure age/filter functions in `inventory-model.ts` and the fetch/subscription lifecycle in `inventory-api.ts` / `useInventory.ts`. These are feature files, not a new component framework.

Fetch complete inventory snapshots from NestJS. Apply filters and summary calculations to the same snapshot. This is appropriate for the small seeded dataset; server pagination and larger inventories are outside this demo's scope.

Connect directly to Supabase Realtime using only the local URL and publishable/anon key. The browser never receives the service-role key. Realtime notifications invalidate the loaded snapshot; HTTP remains the authoritative read path.

### NestJS inventory feature

Add an inventory module with controller and service following the existing NestJS structure. Use the Supabase JavaScript client server-side for database access. Keep the existing starter endpoint intact.

- `GET /inventory`: return vehicles, dealership timezone, server time, reference dealership date, and server-derived days in stock and aging flags.
- `PATCH /inventory/:id/action`: accept action, optional note, and expected version; validate the payload and current aging eligibility, persist atomically, and return the saved vehicle.

Reject unknown action values, malformed IDs or versions, unexpected payload fields, non-string or oversized notes, missing vehicles, and edits to non-aging stock. Use clear 400, 404, 409, and unavailable-service responses as appropriate. Return safe errors without database credentials or internal details.

Use a version condition on the update so two managers cannot silently overwrite each other's edits. If the expected version is stale, return 409; retain the draft and offer to load the latest record before the manager deliberately retries. Realtime refreshes must not replace an open unsaved draft or silently advance its expected version.

Add a development `/api` proxy in `apps/web/vite.config.ts` if one has not been added by other work, preserving its React/Tailwind plugins and any other configuration. Browser reads/writes use `/api/inventory`; NestJS routes remain `/inventory`. Preserve existing providers when registering the inventory module in `AppModule` and any already-applied bootstrap configuration in `main.ts`.

Other appointment plans may later add database or Realtime helpers. Re-check their actual implementation before execution and reuse compatible infrastructure if it exists then; do not make inventory depend on completing an unimplemented appointment plan or edit its documents.

### Supabase schema

Use a `vehicles` table containing:

- ID, unique registration, make, model, model year.
- Price as non-negative integer GBP pence; format for display without money arithmetic in the UI.
- `stocked_on` date.
- Nullable current action, nullable note, nullable action-updated timestamp.
- Non-negative integer action version, initially zero.

Enforce required fields, unique registration, valid action values, price bounds, and note length at the database boundary as well as relevant API validation. Initial records have a null action timestamp; updates use a server-controlled timestamp.

Keep schema migrations and repeatable fictional seed data in the repository's Supabase directory. Include multiple makes/models, vehicles in each age bucket, exact 90/91-day boundary examples, aging vehicles with and without actions, and enough records to demonstrate filtering. Generate stock dates relative to the dealership-local seed execution day. Do not reseed on ordinary application startup or overwrite saved actions.

## Real-time data flow

Use Supabase Realtime Postgres Changes for the demo, enabling the `vehicles` table in the Realtime publication. Supabase documents this as the simpler database-change subscription method; Broadcast remains a possible later choice for larger workloads, not part of this implementation.

1. Load an HTTP inventory snapshot and establish the WebSocket subscription.
2. On every successful subscription, including the initial subscription, refetch a snapshot. This closes the gap between the initial request and subscription readiness.
3. A committed vehicle insert, update, or delete triggers a database change event.
4. Connected dashboards refetch their inventory snapshot and preserve active filters.
5. A successful action save also refreshes the saving dashboard without waiting for its own notification.
6. After reconnection or tab visibility restoration, refetch to recover changes missed while disconnected.

Ignore superseded request responses so a slower earlier fetch cannot overwrite newer data. Clean up subscriptions and requests when leaving the screen.

Show Connecting, Live, Reconnecting, or Disconnected as appropriate. Live requires a subscribed channel and a successful snapshot fetched after subscription. Keep the previous data on errors with a visible stale-data warning and retry control. A connected WebSocket with a failed HTTP refresh must not imply the displayed inventory is current.

WebSocket delivery is not a durable event history. Re-fetching the authoritative snapshot recovers state after connection loss.

## Local demo access and configuration

This is a single-dealership demo with fictional records and no login flow. Bind the web app, NestJS API, and local Supabase network endpoints to loopback. Do not expose it publicly.

Enable row-level security on `vehicles`. Permit anonymous SELECT for the fictional local inventory so Postgres Changes can authorize reads; deny browser INSERT, UPDATE, and DELETE. NestJS alone holds the service-role credential for writes and performs validation. This is deliberately local demo access, not production manager authorization.

Restrict API browser origins to the configured local frontend. Store real keys only in ignored environment files; commit placeholder `.env.example` files and setup instructions. Fail clearly when required configuration is missing.

Use a dedicated local Supabase project identity and verify port availability before startup, avoiding unrelated local projects. Ordinary setup must not reset an existing database. Document destructive reset separately and run it only against an explicitly identified disposable feature test database.

## Error states

- Initial fetch failure: explain the failure and offer Retry rather than showing zero inventory.
- Empty dealership: show a true empty-inventory state.
- No filter matches: show a filtered empty state and Clear filters.
- Save failure: preserve the entered action and note for retry.
- Edit conflict: explain that another manager changed the vehicle and require review of the latest state.
- Realtime outage: retain the last snapshot, label it stale, reconnect, and refetch after recovery.
- Vehicle removed while editing: prevent save and explain that it is no longer available.

## Verification and acceptance

Use focused tests for stock age at 90/91 days and dealership-local midnight boundaries, combined make/model/age filters, action validation, non-aging rejection, missing records, and atomic version conflicts. Include a time when the UTC date differs from the dealership date.

Rerun the existing `BookingDashboard.test.tsx` and `booking-model.test.ts` as regression checks after extracting layout, Select, and date helpers. Add navigation checks for direct loading of `/admin/bookings`, `/admin/inventory`, and `/`, the correct active link, the booking-only configuration actions, and the different persistence notices. Preserve booking dialog Escape/focus restoration and resource/status behavior.

Verify against a real local Supabase stack that saved actions survive browser refresh and database service restart without a reset. In two browser sessions, save an action in one and observe the other update without manual refresh. Also change a fictional vehicle directly in the local database to prove notifications originate from database changes rather than only a frontend save callback.

Verify reconnect recovery by interrupting a subscription, changing a record, and checking that resubscription loads the latest snapshot. Check save failure preserves the draft, keyboard dialog behavior, table empty states, and a narrow viewport. Run the workspace's relevant build, typecheck, and test commands; distinguish automated checks from manual browser evidence.

Acceptance requires the three scenario requirements to work together: filterable inventory, prominent automatic aging identification, and persistent editable actions, with working WebSocket updates across sessions.

## Revised delivery sequence and change surface

1. Establish the current booking test baseline, then extract the existing admin layout, generic Select, and dealership-date helper. Update only their actual consumers and keep the booking feature behavior intact.
2. Add the Inventory route, shared navigation, summary/filter/table/details composition, and action dialog using the existing UI patterns. Wire this feature to its HTTP interface; missing backend configuration must show an explicit error rather than silently claiming sample state is live.
3. Add the isolated NestJS inventory module, Supabase migration/seed, server validation, and versioned action saves. Preserve all existing API modules, credentials, and data.
4. Wire Supabase WebSocket invalidations, subscription/refetch recovery, stale-state handling, and dealership-midnight refreshes into the inventory feature.
5. Run focused inventory and booking regressions, workspace checks, then real local Supabase persistence/two-browser verification. Update web/API/root setup documentation with the two admin sections and their actual persistence boundaries.

Expected application touch points are `apps/web/src/main.tsx`, `apps/web/src/admin/BookingDashboard.tsx`, `BookingEditor.tsx`, `BookingSelect.tsx`, `booking-model.ts`, their existing tests, `booking-dashboard.css`, `apps/web/vite.config.ts`, `apps/web/package.json`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/package.json`, `pnpm-lock.yaml`, example environment files, and setup documentation. New files are the small shared admin pieces, the inventory frontend/API feature, focused tests, and local Supabase configuration/migrations/seed. Avoid changes to `App.tsx`, `SalesHubShowcase.tsx`, shared UI primitives, or appointment-plan documents unless execution reveals a specific required integration.

The working checkout contains substantial unrelated untracked work and an edited appointment specification. Stage only inventory-authorized files or hunks during implementation; never sweep the checkout into a commit or overwrite other work. This revision changes only this inventory design document.

## Scope exclusions and limits

No action history, AI-generated advice, charts, bulk edits, vehicle CRUD screens, external dealership integrations, login UI, multiple dealerships, public deployment, or hosted Supabase provisioning.

Local Supabase requires a running container runtime. Postgres Changes and whole-inventory refetches suit this demo's small dataset; larger workloads need a separate scale review. Access policies and authentication must be redesigned before using real dealership records or exposing the app outside the local machine.

## Source references

- [Supabase database subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Realtime architecture](https://supabase.com/docs/guides/realtime/architecture)
- [Supabase local development](https://supabase.com/docs/guides/local-development)

## Specification self-review

Checked for placeholders, contradictory transport/storage decisions, aging/date boundaries, persistence semantics, reconnect gaps, error handling, access boundaries, existing-admin reuse, actual versus planned infrastructure, and unrelated scope. The revised design uses the actual pathname routing and dealership timezone, preserves booking-only actions and ephemeral booking storage, and distinguishes shared layout from domain rules. The user subsequently invoked writing-plans to proceed with the implementation plan.
