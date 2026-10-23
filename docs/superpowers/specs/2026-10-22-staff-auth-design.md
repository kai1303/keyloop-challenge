# Better Auth JWT and staff RBAC

## Agreed scope

The user selected Better Auth and JWT access tokens. Admin has all staff modules;
Technician has every booking feature, including create, reschedule, cancel, and
service status changes across bookings. Technician cannot access Inventory,
Sales Leads, or Documents. Guest appointment routes remain public.

## Design

Better Auth runs inside the existing NestJS Express process. Its PostgreSQL
adapter stores users, hashed passwords, sessions, rate limits and signing keys
in private `staff_auth` tables inside the already-shared database. Its Admin
plugin provides the two server-managed roles (`admin`, `technician`), with no
public sign-up and no user-editable role. A local server-side provisioning
command creates initial accounts without placing passwords in command history.

The React login calls Better Auth, then obtains a five-minute JWT through its
JWT plugin. JWT access tokens live only in memory. An HTTP-only Better Auth
session cookie renews them after expiry/reload; it is not accepted as a substitute
for a JWT by staff business APIs. The API checks signature, algorithm, issuer,
audience, expiry, subject and session ID, then reads the current session and role
from the database. Revocation/role changes therefore apply on the next request.

NestJS guards enforce role metadata. Guest booking endpoints and the minimal
root health response remain public. Document source HTTP calls forward the
current JWT to the protected local mocks. No shared admin-key fallback remains.
Vite proxies forward headers rather than inventing identity.

Inventory rows are no longer anonymously readable over the Data API. Because
Better Auth sessions are independent of Supabase Auth, inventory realtime changes
to sanitized public Broadcast invalidations with no row data; the browser then
refetches the authenticated API. Guest appointment date-only Broadcast is retained.
No second auth database or Supabase JWT bridge is introduced.

## UI and verification

Add a branded staff sign-in page, protected route boundary, role-aware navigation,
current identity and sign-out. Technician uses the existing full booking screen.
No self-registration, email delivery, MFA or new user-management screen is in
scope. Account provisioning uses the server command and Better Auth API.

Verify real signing/login/logout/renewal on isolated PostgreSQL, API 401/403 role
matrices, invalid/expired tokens, no key/cookie bypass, signup/role-escalation
rejection, private database grants, realtime refetch and user switching. Retain
existing domain/guest tests. Back up live data before applying additive auth and
inventory privacy migrations; preserve existing records and migration history.
