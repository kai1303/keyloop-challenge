# Appointment Scheduler video submission script

An approximately eight to nine minute recording focused on Appointment Scheduler.
Each section has screen actions followed by words to read aloud. The companion
[narration file](video-submission-narration.txt) contains only the spoken text.
Timings are rehearsal targets, including clicks and short pauses.

## Before recording

- Read the introduction once and adjust the name or wording to sound like you.
- Start the app using the root [README](../README.md). Sign in to a staff account
  before recording so passwords, tokens and environment files stay off screen.
- Open three tabs: the [overall architecture diagram](architecture/overview.svg),
  [guest appointments](http://127.0.0.1:5173/appointments), and
  [staff bookings](http://127.0.0.1:5173/admin/bookings).
- Rehearse with a future open weekday and an available whole-hour start. Read
  the dealership timezone displayed by the app; do not assume it is the
  computer's timezone. The current service model uses one-hour appointments.
- Prepare fictional details: name `Recording Demo`, email
  `recording-demo@example.com`, phone `07000000000`, registration `DEMO001`.
  Keep the staff tab on the same date as the guest booking.
- Find a later available hour for rescheduling. Keep the booking Confirmed until
  cancellation; starting service changes which actions are allowed.
- Run `pnpm test`, `pnpm build`, and
  `pnpm --filter @keyloop-interview/api test:e2e` before the recording. Keep the
  successful summaries ready to show briefly. Avoid waiting for full test runs
  during the video. These checks do not replace real PostgreSQL integration tests.
- Use the overall diagram linked above. The existing detailed appointment diagram
  still describes the older locking approach; current allocation uses versioned
  resource-hour claims in
  [slot-claims.ts](../apps/api/src/bookings/slot-claims.ts).
- Keep this script beside the captured window or on another screen. Read only
  the “Read aloud” paragraphs. Allow short silent pauses while clicking.

## 0:00 to 0:35 Introduction and scenario

### Show

Open the guest appointment calendar. Move the pointer away from the content.

### Read aloud

Hi, I'm Kai. For this exercise, I chose to focus on the Appointment Scheduler
for a vehicle dealership.

The customer needs a convenient way to book a service. The dealership needs to
make sure that a qualified technician and a service bay are both available.

I'll walk through the architecture, explain the main implementation decisions
and how I worked with AI, then demonstrate the booking flow and share what I learned.

## 0:35 to 1:45 System design

### Show

Switch to the overall architecture diagram. Point to the guest and staff routes,
the NestJS API, PostgreSQL, and the Realtime notification arrows in that order.
The diagram includes the other scenarios; keep the explanation on BookingsModule.

### Read aloud

The application has one React frontend, one NestJS API, and one PostgreSQL
database provided by Supabase. The wider application contains other dealership
features, but this walkthrough focuses on the booking module.

React provides separate guest and staff experiences. NestJS handles validation,
authorization, scheduling rules, and booking operations. TypeORM manages the
database connection and transactions.

I kept these as modules within one application because the demo does not need
the operational complexity of separate services. PostgreSQL gives the booking
workflow a transactional foundation, and Luxon handles dealership-local dates
and opening hours.

Supabase Realtime tells open clients when a date has changed. They then fetch
the latest data from the API. A notification contains the affected date, with
no customer details. The database remains the authority for whether a booking
can actually be confirmed.

## 1:45 to 2:45 Implementation highlights

### Show

Open [bookings.service.ts](../apps/api/src/bookings/bookings.service.ts) at
`create` and `bookingTransaction`, then
[slot-claims.ts](../apps/api/src/bookings/slot-claims.ts) at the conditional
version update. Keep the code zoomed in; explain the behavior without reading SQL.
If showing code would interrupt the flow, keep the architecture diagram visible.

### Read aloud

The most important distinction is between showing availability and reserving
capacity. An available time on screen is only a preview.

When the customer confirms, the backend validates the service, opening hours,
time, and technician qualifications. It selects a technician and bay, then
claims their hourly capacity using version checks inside a database transaction.

If another request changes a slot first, the transaction rolls back and retries
with fresh state. The resource claims and booking are saved together.

Staff edits also send the booking version they read. A stale edit returns a
conflict rather than silently overwriting somebody else's change.

Staff access uses Better Auth and signed JWTs. The backend checks the current
session and role; the browser does not get direct access to customer tables.

## 2:45 to 4:15 AI collaboration story

### Show

Open the [README AI Collaboration Narrative](../README.md#ai-collaboration-narrative).
Then briefly show the scheduling tests or prepared successful test summaries.
Keep this section between one and two minutes during rehearsal.

### Read aloud

I used AI as a collaborator for design, implementation, tests, and documentation.
My role was to define the business rules, challenge the suggestions, and decide
what evidence was needed before accepting a change.

I started with concrete rules: a booking needs a qualified technician and a bay,
must fit within opening hours, and must remain correct when requests arrive
together. I also asked the AI to reuse the existing application and UI components.

I worked in small steps. For each change, I reviewed the affected code and
checked the behavior with tests. The important cases included scheduling
boundaries, competing bookings, failed reschedules, stale staff edits, and
unauthorized access.

I separated different kinds of evidence. Unit tests check rules with controlled
inputs. Database integration tests check transactions and concurrency. Browser
checks exercise the user journey and live updates. A passing mock does not prove
that the database or WebSocket path works.

One recent example was frontend tests failing during concurrent checks. We
limited frontend test workers and repeated uncached concurrent runs while keeping
the same assertions and timeouts.

AI accelerated the work, while review and verification determined what I accepted.

## 4:15 to 7:00 Application demonstration

### Show

Perform the following in order. Speak each matching paragraph, then pause for
the action rather than trying to fill every second.

1. **Guest booking:** Select the rehearsed future open date, choose a service
   and available start, then enter the fictional details. Click
   **Confirm appointment** and pause on the confirmation.
2. **Staff visibility:** Switch to the staff tab on the same date. Let the
   booking appear through the live update, then find `DEMO001` or
   `Recording Demo` and open its details. Show the allocated technician and bay.
3. **Rescheduling:** Use the edit/reschedule action on this Confirmed booking.
   Choose the rehearsed later available time and save. Show the updated time.
4. **Persistence:** Reload the staff page and reopen the same booking.
5. **Cancellation:** Click **Cancel booking**, enter `Recording demonstration
   complete`, and confirm. Show the Cancelled status.

A single booking may leave capacity for other technician-and-bay pairs at the
same hour. Do not claim the whole hour becomes unavailable after one booking.
Cancel only the booking created for this recording; do not clear existing data.

### Read aloud

I'll start with the customer experience. I choose a future day when the
dealership is open, select a service, and choose an available start time.
The end time is calculated for me. In this version, services last one hour
and start on whole hours.

I'll use fictional customer and vehicle details, then confirm the appointment.
The confirmation means the backend has saved the booking and allocated the
required resources. Merely selecting the time earlier did not reserve them.

Now I'll switch to the staff dashboard for the same date. The booking appears
in the day's schedule. I can search for the registration and open the details
to see the customer, service, technician, and bay.

Next, I'll move this confirmed appointment to another available time. The
backend validates and claims the replacement capacity in the same transaction
as the move. If that move fails, the original appointment remains intact.

I'll reload the page to show that the updated appointment is persisted,
then open it again.

Finally, I'll cancel the appointment and record a reason. The booking remains
visible as cancelled, and its resource capacity is released.

That demonstrates the customer journey and staff workflow using the same
persisted booking data and shared scheduling rules.

## 7:00 to 8:00 Lessons and challenges

### Show

Keep the cancelled booking visible, then switch to the architecture diagram or
prepared test summary. Do not introduce another feature at this point.

### Read aloud

The biggest challenge was concurrency. Two customers can see the same available
time, so the confirmation transaction has to resolve the competition safely.
An in-memory availability calculation alone is not enough.

Timezone handling was another challenge. Opening hours and calendar dates belong
to the dealership's timezone, and daylight-saving boundaries need explicit tests.

I also learned to distinguish a convincing interface from a complete workflow.
Persistence, stale edits, cancellation, and failed reschedules all need their
own checks.

This is a local interview demo. Before a production rollout, I would add
structured logging, operational metrics and tracing, and review deployment
security and capacity. Those are next steps, not capabilities I am claiming
are already installed.

## 8:00 to 8:20 Closing

### Show

Return to the guest calendar or the staff dashboard. Pause briefly before ending.

### Read aloud

This scheduler connects a simple booking experience to validated, transactional
resource allocation and a protected staff workflow.

The repository includes the architecture, setup instructions, AI collaboration
narrative, and automated tests. Thank you for watching.

## Rehearsal and fallback notes

- Aim for roughly eight to nine minutes at a natural pace. If the recording runs
  long, shorten the code view and keep the guest booking, staff reschedule, and
  cancellation. Keep the AI story between one and two minutes.
- If a time is no longer available, choose another available time. Do not try to
  manufacture a simultaneous-booking race during the recording; explain it and
  show the relevant automated tests instead.
- If the staff tab does not update automatically during rehearsal, resolve the
  connection before recording. If it happens during the take, say “The live
  connection is unavailable, so I'll refresh the authoritative API data,” then
  reload. Do not describe a manual refresh as proof of live delivery.
- The script reflects the current source and documentation. Rehearse every click
  against the running app before recording; a full live rehearsal was not part
  of preparing this script.
- The root system design document still needs the remaining Part 1 sections
  identified in the submission review. This recording script does not complete
  that separate deliverable.
