# Booking verification after admin persistence fix

All 18 live checks passed against local Supabase, NestJS port 3000, guest UI 5174 and admin UI 5175.

| Area | Result | Evidence |
|---|---|---|
| Auto matching | PASS | Qualified technicians, independent technician/bay pairs, 60-minute persisted intervals |
| Double booking | PASS | Ten competing admin requests: one 201, nine 409. Guest race: one 201, nine 409; five observed PostgreSQL lock waiters. Mixed services: two independent pairs, eight conflicts |
| Admin persistence | PASS | Browser creation survives reload; reschedule and cancellation saved with increasing versions |
| Stale changes | PASS | Stale create form retains details and shows conflict; stale reschedule version returns 409 |
| Realtime | PASS | Admin peer receives Broadcast then refetches automatically; reschedule, cancellation and service statuses propagate. Guest peer disables occupied start time and confirmation |
| Cancellation | PASS | Same technician/bay pair can be reused; cancelled history is outside active bay lanes |
| Privacy | PASS | Guest proxy receives 403 for private admin routes; admin secret absent from compiled browser JavaScript |
| Cleanup | PASS | Removed 10 fixture bookings, vehicles and customers; original four bookings and all related data match baseline hashes. Guest slot re-enabled |

Automated checks: 40 backend unit, 42 HTTP, 39 PostgreSQL integration tests; frontend suite passed 106 tests with 3 existing opt-in tests skipped, plus the final cancelled-overlap regression passed. Frontend build/typecheck passed.

Scope: local development only. Booking hours/timezone come from the appointment API, currently UTC. Production deployment and staff authentication were not added; the local Vite proxy injects the server-only admin credential.

Detailed assertions and timestamps: [booking-e2e-results.json](booking-e2e-results.json).
