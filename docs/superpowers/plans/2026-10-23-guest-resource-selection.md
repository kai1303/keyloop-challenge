# Guest resource selection

**User requirement:** After selecting the service and start time, show available qualified technicians and bays. Require the customer to choose both; no automatic assignment option in the guest modal.

**Design:** Extend the existing public monthly snapshot with technician/bay names and stable resource IDs. Customer details, vehicles, login data, and booking IDs remain private. Replace response-local resource aliases because their numbering can change on refresh and must not switch a customer's selected technician. Reuse the frontend's existing daily bitmaps to return free resource lists for each start. Time/service changes clear the resource selections; refreshes retain valid choices and clear unavailable ones without substituting another resource. Fail closed during reads/errors. Preserve exact idempotent retries, even if the committed booking occupies the selected resources or its start passes.

Guest POST requires validated `technicianId` and `serviceBayId`; controller passes them into the existing allocator. Staff create retains optional assignment. The allocator validates qualification and full-interval capacity, locks and rechecks the exact pair, and never falls back to another pair for an explicit choice. Selected IDs already participate in the idempotency fingerprint.

**Scope:** Guest DTO/controller; public snapshot types/service; frontend bitmap helper/form; affected HTTP, integration, UI fixtures/tests; current API/web architecture docs. No migrations, dependencies, or unrelated changes.

- [x] Add failing helper/UI/HTTP tests for required selection, qualified/free options, time/live changes, and exact selected pair handling.
- [x] Implement stable named resources, mandatory guest DTO selections, frontend lists, stale-choice handling and retry preservation.
- [x] Update callers/docs, then run web/API/guarded PostgreSQL checks and builds.
- [x] Verify the live modal and snapshot, leave the modal ready, and save evidence.

Execute inline; preserve dirty work. No commits or deployment requested.

**Verified:** Web 191 passed / 3 skipped; API unit 119 passed; HTTP 77 passed; guarded PostgreSQL integration 78 passed. API/web builds, API typecheck/lint passed. The final modal tests (22) and web build passed after adding bounded modal scrolling and updated guidance. Live free-resource lists matched independent PostgreSQL overlap queries for both services at 10:00 and 12:00 UTC. Selecting resources issued no HTTP calls; one date-only Broadcast caused one monthly refresh and retained the selected valid pair. Changing the time cleared both choices. No live booking was submitted.
