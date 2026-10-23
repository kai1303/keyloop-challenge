# Persistent Admin Bookings Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the backend task and verification-before-completion throughout.

**Goal:** Make admin bookings use the existing persistent allocator and date-only Supabase Broadcast, fixing cross-tab duplicates, missing refreshes and reload loss.

**Architecture:** The appointment API in the attached appointment worktree remains the single booking backend. Main web proxies /booking-api to it and injects a server-only BOOKING_ADMIN_KEY header. Admin catalog and records are private guarded routes; guest routes remain anonymous. Admin loads API configuration/rosters and follows the backend timezone. UI has no local write fallback. Transactions lock/recheck resources for creation and rescheduling; cancelled bookings release resources and other statuses retain occupancy. Date broadcasts invalidate the selected-day query. Existing header-create removal and duration-field removal remain.

**Tech Stack:** NestJS, PostgreSQL/TypeORM, Supabase Broadcast, React, existing TanStack Query, Luxon, Vitest.

## API contract
- GET /admin/bookings/catalog => {services:[{id,name,durationMinutes}],technicians:[{id,name,services:string[]}],bays:[{id,name}],schedule:{timeZone,hours:[{open,close}|null]}}
- GET /admin/bookings?date=YYYY-MM-DD => Booking[]
- POST /admin/bookings => guest create fields plus optional technicianId,serviceBayId UUIDs. Omit auto values. Returns full Booking.
- PATCH /admin/bookings/:id/reschedule => {startsAt,technicianId?,serviceBayId?,expectedVersion:number}, returns Booking.
- PATCH /admin/bookings/:id/status => {status,cancellationReason?,expectedVersion:number}, returns Booking.
- Booking => {id,name,email,phoneNumber,registrationNumber,serviceTypeId,date,time,technicianId,serviceBayId,durationMinutes,status,cancellationReason?,version:number,startsAt,endsAt}.
- Header x-booking-admin-key must match server BOOKING_ADMIN_KEY. Missing configuration fails closed. Public guest proxy cannot access admin routes. Server key never sent to browser.

## Tasks
- [x] Backend TDD: guarded admin endpoints, catalog/list, creation/manual assignment through shared allocator, versioned reschedule/status, status-aware occupancy, additive migrations and date-only broadcasts. Preserve historical records.
- [x] UI TDD: API adapter and query/invalidation hook; API configuration context; presentation components use dynamic rosters/hours/timezone. Async forms retain edits/errors and disable repeated submission. Loading/error states never substitute local bookings.
- [x] Keep presentation tests on explicit fixture harness; remove local allocation from the runtime path. Test persisted fetches/mutations and Realtime invalidation separately.
- [x] Configure local server-only proxy key and public Realtime client settings without printing secrets. Apply additive migration and restart booking API/main Vite while preserving unrelated inventory services.
- [x] Rerun live browser creation, matching, same-slot race, cross-tab updates, reload persistence, cancellation/release, reschedule conflict, status transitions, guest privacy and cleanup verification. Preserve original database records and report remaining limits.

No customer login, new header action, persisted bitmap cache, roster CRUD, production authentication system or unrelated inventory changes.
