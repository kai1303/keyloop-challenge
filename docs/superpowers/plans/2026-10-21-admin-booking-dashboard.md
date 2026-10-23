# Admin Booking Dashboard Implementation Plan

> Execute inline, using test-driven development and verification before completion. User approved the wireframe and explicitly chose a working UI with sample data first.

**Goal:** Build the approved admin dashboard with the existing Keyloop design system and functional session-local booking management.

**Architecture:** An isolated `/admin/bookings` React route shares the existing Motion providers and Keyloop UI library. A small typed booking model validates resource assignments and opening hours; React state holds fictional appointments, with no customer APIs or persistence. Existing `/` component preview stays intact.

**Tech stack:** Existing React, TypeScript, Vite, shared Keyloop tokens/components, Vitest, React Testing Library and jsdom.

## File map

- `apps/web/src/admin/booking-model.ts`: types, catalog, dealer dates, demo fixture generation, filters, allocation, transitions.
- `apps/web/src/admin/booking-model.test.ts`: full-duration bay/technician conflicts, adjacency, qualifications, hours, closed dates and statuses.
- `apps/web/src/admin/BookingDashboard.tsx`: shell, filters, metrics, selected appointment and session state.
- `apps/web/src/admin/BookingSchedule.tsx`: resource day timeline and booking list using shared Button/Table.
- `apps/web/src/admin/BookingDetails.tsx`: customer/service panel and lifecycle actions using shared controls.
- `apps/web/src/admin/BookingEditor.tsx`: create/reschedule forms and cancellation confirmation using shared Dialog, Input, Label, Select, Textarea.
- `apps/web/src/admin/BookingDashboard.test.tsx`: navigation, search/filter/empty state, details, creating and editing bookings, conflicts, cancellation and status transitions.
- `apps/web/src/admin/booking-dashboard.css`: layout and timeline geometry only; colors/fonts/radii use Keyloop tokens and semantic theme tokens.
- `apps/web/src/main.tsx`: add exact route without replacing existing routes.
- `apps/web/package.json`, `pnpm-lock.yaml`: browser testing dependencies and test script.
- `apps/web/README.md`: route, demo limits and verification commands.

## Task 1: Domain behavior, tests first

- [x] Add the test script `vitest run`. Add tests against a temporary empty implementation to prove assertions fail, then implement each behavior.
- [x] Define `BookingStatus = 'CONFIRMED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED'`. A booking stores ID, submitted name/email/phone/registration, service ID, technician ID, bay ID, local date/time and fixed duration.
- [x] Fixed catalog: Oil change 30 min and Inspection 60 min; Avery qualifies for Oil, Jordan for Inspection, Casey for both; three service bays. Demo hours Mon–Fri 09:00–17:00 in Asia/Ho_Chi_Minh.
- [x] Validate required contact fields, normalized email, seven-day date validity, future appointment start, fixed service duration, qualification and complete interval inside opening hours. Conflict is `existingStart < requestedEnd && existingEnd > requestedStart` and same technician OR bay; ignore only cancelled bookings and the booking being edited.
- [x] Explicit edits validate their selected pair. Creation picks the first qualified free pair. Invalid edits throw before changing state.
- [x] Permit CONFIRMED → IN_SERVICE or CANCELLED; IN_SERVICE → COMPLETED. Reject all other transitions. Reschedule only CONFIRMED.
- [x] Generate fictional sample bookings for today with a visible Demo badge. Do not use or store production credentials, customer APIs or browser storage.
- [x] Run `pnpm --filter @keyloop-interview/web test src/admin/booking-model.test.ts` and typecheck.

## Task 2: Page and interactions, tests first

- [x] Render the empty route/component and add component tests first; verify the missing heading fails before the page is implemented.
- [x] Keep the existing root UI. Mount `/admin/bookings` within the existing StrictMode/Motion configuration. Preserve current and concurrently added route imports.
- [x] Build a responsive shell: compact Keyloop nav; Operate accent; heading, timezone and demo label; selected-day counts; search, status and technician filters; day controls and Day/List switch; timeline and selected booking panel.
- [x] Use shared Button, Badge, Card, MetricCard, Input, Label, Select, Table, Dialog and Textarea. Avoid duplicated controls and inline brand colors.
- [x] Timeline columns represent service bays; position blocks by start and snapshotted duration. Labels include booking time/customer and status, with a complete accessible label. Show cancellation with text and a dashed mark, not color alone. At narrow widths, stack detail panel below schedule and use a contained timeline scroll region if needed.
- [x] Filtering preserves the selected day. Empty results show an explicit empty state. Detail actions update shared state, metrics and both views together.
- [x] Creation and reschedule use the same model validation as tests; fixed service duration cannot be edited. Date/time defaults to the next open future start. Reassignment lists qualified technicians only; whole-interval conflicts show inline errors and retain entered values.
- [x] Cancellation requires a confirmation dialog; lifecycle actions are allowed only by their status. Dialogs restore focus to the originating control and support Escape.
- [x] Unit/component checks: selected booking details, Day/List, search/clear, filter empty state, date navigation, valid creation, reassignment conflict, valid reschedule, cancellation, start/complete service. Add keyboard/focus coverage and ensure session data resets on refresh.

## Task 3: Verify and deliver

- [x] Run full browser tests, workspace tests, typecheck and build. Fix introduced failures without changing unrelated UI sources.
- [x] Start this isolated app on a distinct loopback port. Inspect desktop and narrow layouts in the browser. Verify create/edit/conflict/cancel and focus behavior against the rendered page.
- [x] Review new files directly, including sensitive-data and mutation boundaries. No subagents in this side conversation.
- [x] Document sample data, route, opening-hours fixtures, session-only storage and pending real-data/staff-access integration. Deliver URL and verified checks; preserve the main chat's worktree and processes.

## Delivery evidence

Delivered to `/Users/kai/works/side-project/keyloop-interview`. Preview: http://127.0.0.1:5175/admin/bookings.

- 40 browser unit/component tests pass (30 domain, 10 UI).
- Web TypeScript and production build pass; route splitting keeps each JavaScript chunk below the earlier 500 kB warning.
- Workspace tests, typecheck, build and lint passed during isolated verification; direct type-aware lint of the admin files is clean.
- Native browser checks: booking creation, keyboard time edit, reschedule, cancellation reason and resource release.
- Responsive checks: 390px and 320px; measured document width equals viewport after the mobile navigation wrap fix.
- Existing root component preview is retained. API sources and shared components were not modified.
- Demo only: no server persistence, production customer data, or staff authentication.

## Follow-up: shadcn components and anchored booking details

- Replaced the standalone details panel with shared shadcn Popover content anchored to calendar events and List booking actions. Details start closed; Escape/close/outside click dismiss, and switching events retains only the latest selection.
- Replaced dashboard MetricCard usage with shadcn Card composition, navigation with Sidebar/Menu components, and Day/List buttons with Tabs.
- Added official new-york-v4 Popover, Sidebar, Tabs and supporting components using existing dependencies. Kept local Keyloop tokens and reduced-motion-aware detail animations. Existing MetricCard/component preview remains available.
- Verified 43 tests, web build/typecheck, shared UI typecheck, and scoped type-aware lint. Browser checked event switching, Escape focus restoration, outside dismissal, List details, edit-dialog return focus, and viewport fit at 390px/320px. No browser console errors.
- Preview: http://127.0.0.1:5175/admin/bookings. Screenshot: booking-admin-popover.png in this task's visualization directory. Sample data remains session-only; backend integration was not exercised.

## Follow-up: shadcn Calendar for schedule date selection

- Added the official new-york-v4 Calendar to the local UI package with react-day-picker/date-fns dependencies. Replaced only the schedule toolbar's native date input with Calendar + Popover; kept the resource timeline and booking-editor fields.
- Date selection updates schedule/new-booking defaults and restores trigger focus. Uses the dealership timezone and permits viewing closed days. Existing Motion and reduced-motion preferences apply.
- Verified all 46 web tests, web build/typecheck, UI typecheck and scoped type-aware lint. Four date-related tests also passed under each host timezone America/Los_Angeles and Pacific/Auckland. Browser confirmed picking the next date updates the schedule and restores focus; at 320px the picker and page fit without horizontal overflow.
