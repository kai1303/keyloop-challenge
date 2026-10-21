# Intelligent Inventory Dashboard

Date: 2026-10-21
Domain: Supply
Status: Design recorded; awaiting written specification review

## Purpose and agreed scope

Give a dealership manager a real-time overview of vehicle inventory, make stock older than 90 days prominent, and persist a current action for each aging vehicle.

The user selected a working interview demo with seeded vehicles and database persistence, one editable current action rather than action history, WebSocket updates, and Supabase. Visual brainstorming was declined.

Use the existing React application, shared Keyloop UI components, and NestJS API. Supabase PostgreSQL replaces the proposed SQLite database. Supabase Realtime replaces the proposed custom WebSocket server; SSE and periodic polling are excluded.

Default to a local Supabase development stack for this demo. Docker and the Supabase CLI are installed, and the Docker daemon responded during design exploration. No Supabase instance has been started for this feature. Hosted infrastructure provisioning and public deployment are outside scope.

## Manager experience

Provide a dedicated inventory screen at `#inventory`, with a clear entry from the existing preview. Preserve the existing component showcase and unrelated application work.

- Header: Intelligent Inventory, Supply domain label, connection status, and last successful data refresh.
- Summary cards: total vehicles, aging vehicles, and aging vehicles with no action. These describe the whole dealership, independent of table filters.
- Aging shortcut: selecting the aging summary applies the over-90-days filter. Include a visible count and text label, not color alone.
- Filters: make, model, and days in stock. Age choices are all, 0–30, 31–60, 61–90, and over 90 days. Filters combine with AND; changing make clears an incompatible model selection. Include Clear filters and a matching-result count.
- Inventory table: vehicle make/model/year, registration, price in GBP, days in stock, current action, and row action. Show all matching seeded vehicles; default order is oldest stock first, with vehicle ID as a stable tie-breaker.
- Aging badge: label vehicles over 90 days as Aging stock. Aging vehicles without an action also show Needs action.
- Row action: aging vehicles offer Log action or Edit action. Non-aging vehicles show their current action if one exists, but cannot receive new action edits through this workflow.

The layout adapts to smaller screens, retaining vehicle identity and controls. A table may scroll horizontally inside its own container. Use existing labelled controls, accessible table markup, dialog focus management, and reduced-motion behavior.

## Aging definition

Store the date a vehicle entered inventory as `stocked_on`, a PostgreSQL date. Vehicle manufacture year does not determine stock age.

For the single-dealership demo, use UTC calendar dates consistently. Days in stock is the difference between today's UTC date and `stocked_on`. Exactly 90 days is not aging; 91 days is aging. Reject future stock dates when seed data is prepared.

The API returns its current UTC date with each inventory snapshot and calculates aging consistently for responses and save validation. Refresh an open dashboard at the next UTC date boundary and when the tab becomes visible again, so aging changes without a database mutation. This date refresh is separate from WebSocket updates; there is no periodic inventory polling.

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

Add a focused inventory feature in `apps/web`, reusing the shared UI package. Keep inventory state and subscription lifecycle in this feature rather than adding behavior to generic UI components.

Fetch complete inventory snapshots from NestJS. Apply filters and summary calculations to the same snapshot. This is appropriate for the small seeded dataset; server pagination and larger inventories are outside this demo's scope.

Connect directly to Supabase Realtime using only the local URL and publishable/anon key. The browser never receives the service-role key. Realtime notifications invalidate the loaded snapshot; HTTP remains the authoritative read path.

### NestJS inventory feature

Add an inventory module with controller and service following the existing NestJS structure. Use the Supabase JavaScript client server-side for database access. Keep the existing starter endpoint intact.

- `GET /inventory`: return vehicles, the reference UTC date, and server-derived days in stock and aging flags.
- `PATCH /inventory/:id/action`: accept action, optional note, and expected version; validate the payload and current aging eligibility, persist atomically, and return the saved vehicle.

Reject unknown action values, malformed IDs or versions, unexpected payload fields, non-string or oversized notes, missing vehicles, and edits to non-aging stock. Use clear 400, 404, 409, and unavailable-service responses as appropriate. Return safe errors without database credentials or internal details.

Use a version condition on the update so two managers cannot silently overwrite each other's edits. If the expected version is stale, return 409; retain the draft and offer to load the latest record before the manager deliberately retries. Realtime refreshes must not replace an open unsaved draft or silently advance its expected version.

### Supabase schema

Use a `vehicles` table containing:

- ID, unique registration, make, model, model year.
- Price as non-negative integer GBP pence; format for display without money arithmetic in the UI.
- `stocked_on` date.
- Nullable current action, nullable note, nullable action-updated timestamp.
- Non-negative integer action version, initially zero.

Enforce required fields, unique registration, valid action values, price bounds, and note length at the database boundary as well as relevant API validation. Initial records have a null action timestamp; updates use a server-controlled timestamp.

Keep schema migrations and repeatable fictional seed data in the repository's Supabase directory. Include multiple makes/models, vehicles in each age bucket, exact 90/91-day boundary examples, aging vehicles with and without actions, and enough records to demonstrate filtering. Generate stock dates relative to seed execution day. Do not reseed on ordinary application startup or overwrite saved actions.

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

Use focused tests for stock age at 90/91 days and UTC boundaries, combined make/model/age filters, action validation, non-aging rejection, missing records, and atomic version conflicts.

Verify against a real local Supabase stack that saved actions survive browser refresh and database service restart without a reset. In two browser sessions, save an action in one and observe the other update without manual refresh. Also change a fictional vehicle directly in the local database to prove notifications originate from database changes rather than only a frontend save callback.

Verify reconnect recovery by interrupting a subscription, changing a record, and checking that resubscription loads the latest snapshot. Check save failure preserves the draft, keyboard dialog behavior, table empty states, and a narrow viewport. Run the workspace's relevant build, typecheck, and test commands; distinguish automated checks from manual browser evidence.

Acceptance requires the three scenario requirements to work together: filterable inventory, prominent automatic aging identification, and persistent editable actions, with working WebSocket updates across sessions.

## Scope exclusions and limits

No action history, AI-generated advice, charts, bulk edits, vehicle CRUD screens, external dealership integrations, login UI, multiple dealerships, public deployment, or hosted Supabase provisioning.

Local Supabase requires a running container runtime. Postgres Changes and whole-inventory refetches suit this demo's small dataset; larger workloads need a separate scale review. Access policies and authentication must be redesigned before using real dealership records or exposing the app outside the local machine.

## Source references

- [Supabase database subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Realtime architecture](https://supabase.com/docs/guides/realtime/architecture)
- [Supabase local development](https://supabase.com/docs/guides/local-development)

## Specification self-review

Checked for placeholders, contradictory transport/storage decisions, ambiguous aging boundaries, persistence semantics, reconnect gaps, error handling, access boundaries, and unrelated scope. The defaults above are explicit and remain subject to the user's review of this written specification.
