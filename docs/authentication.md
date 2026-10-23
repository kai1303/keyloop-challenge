# Staff authentication and RBAC

One Better Auth instance runs inside the unified NestJS API. It stores identities,
password hashes, sessions, signing keys and rate-limit records in private
protected `public` tables in the shared PostgreSQL database. Supabase remains the database and
Realtime platform; staff identity is managed by Better Auth.

## Permissions

| Capability | Guest | Technician | Admin |
| --- | --- | --- | --- |
| Public schedule, services, sanitized calendar and availability | Yes | Yes | Yes |
| Submit a guest booking | Yes | Yes | Yes |
| View all booking/customer details and resource catalog | No | Yes | Yes |
| Create, reschedule/reassign, cancel, start and complete any booking | No | Yes | Yes |
| Inventory reads and actions | No | No | Yes |
| Leads reads and activity creation | No | No | Yes |
| Documents and local source mock APIs | No | No | Yes |
| Better Auth user/role administration | No | No | Yes |

Technician access covers **all bookings**, as requested. A staff identity is
separate from a scheduling resource/technician record; no assignment restriction
is inferred from the account. A global NestJS guard defaults new controllers to
Admin. Only explicit public metadata or allowed roles widen that boundary.

## JWT flow and component roles

1. The login page sends email/password to `/api/auth/sign-in/email`; Vite forwards
   this to Better Auth's `/auth/sign-in/email` handler. Better Auth checks the
   password hash and issues its HTTP-only session cookie.
2. The React auth client requests `/api/auth/token` with that cookie. The JWT
   plugin signs a five-minute EdDSA token containing `sub`, `sid`, `role`, issuer,
   audience `keyloop-api`, issue time and expiry. Customer data and credentials
   are excluded. The cookie is used for session management and JWT renewal.
3. The shared authenticated-fetch helper keeps the access token in memory and
   sends `Authorization: Bearer <JWT>` to staff APIs. It renews near expiry and
   retries a 401 once; concurrent requests share renewal. No JWT is written to
   local/session storage.
4. NestJS verifies signature, algorithm, issuer, audience and expiry. It then
   checks the current user, session expiry/revocation, ban flag and role in
   PostgreSQL. Authorization uses the current database role. Revocation or role
   changes take effect on the next staff request, even before JWT expiry.
5. `/staff/me` provides the verified profile to React. The route boundary and
   navigation expose only allowed screens. Session changes clear private query
   caches. Signing out revokes the session before clearing browser state.

Booking creation also requires a UUID `Idempotency-Key`. Staff keys are scoped to the current verified user; guest creation uses a separate scope. `Location` points to a guarded staff item URL and does not authorize a guest to read customer details.

A cookie alone cannot authorize a staff business API. The old shared booking key
is no longer accepted. The HTTP-only cookie retains Better Auth's SameSite
protection and secure-cookie behavior on HTTPS; origin/CSRF checks remain enabled.
Deploy through HTTPS with the correct trusted origin and reverse proxy settings.

Better Auth's Admin plugin manages account roles. NestJS controls application
permissions independently. The configured role constraint permits exactly `admin`
and `technician`; public signup is disabled and users cannot choose their role.
Sign-in and auth endpoints use database-backed rate limiting.

## Setup and provisioning

Follow the [root runbook](../README.md) for the shared database. Set these API
values before starting:

```dotenv
BETTER_AUTH_SECRET=<at-least-32-random-characters>
BETTER_AUTH_URL=http://127.0.0.1:3006
FRONTEND_ORIGIN=http://127.0.0.1:5173
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
```

Generate the secret with `openssl rand -hex 32`. Keep it stable and private.
`BETTER_AUTH_URL` is the externally reachable API/auth base URL and JWT issuer;
`FRONTEND_ORIGIN` is the exact browser origin. The frontend uses same-origin
`/api/auth` routing; production needs equivalent proxy routes and HTTPS.

Build and apply both migration streams without resetting data:

```sh
supabase migration up --local
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api migration:run:supabase
cp -n apps/api/.env.staff.example apps/api/.env.staff
```

Edit the ignored `.env.staff` file with `STAFF_NAME`, `STAFF_EMAIL`,
`STAFF_PASSWORD` (9–128 characters), and `STAFF_ROLE=admin`, then:

```sh
pnpm --filter @keyloop-interview/api staff:create
```

Repeat with `STAFF_ROLE=technician` for a Technician. The trusted CLI reuses a
customer identity with that email, preserving its ID, phone and bookings. For a
migrated technician profile without an email, set `STAFF_USER_ID` to its exact
existing ID to retain its assignments and service qualifications; names are never
used to match identities. Leave this field unset for a new staff member. An ID
that already has a different email is rejected.

Provisioning attaches a credential account using Better Auth's configured
password hasher and updates the profile in one database transaction. It refuses
users who already have a login, preserving their password, role and sessions;
manage those accounts through authenticated administration instead. Remove the
provisioning password from the file afterward. Keep demo credentials private.
No staff account or fixed password is seeded by migrations.

## API contract and manual checks

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/sign-in/email` | JSON `{ "email": "...", "password": "..." }`; sets Better Auth session cookie. |
| `GET /auth/token` | Session cookie required; returns `{ "token": "<signed JWT>" }`. |
| `POST /auth/sign-out` | Session cookie required; revokes the session. |
| `GET /auth/jwks` | Public verification keys; never private signing keys. |
| `GET /staff/me` | Bearer JWT required; verified Admin or Technician profile. |
| `/admin/bookings` and `/admin/bookings/*` | Bearer JWT required; Admin or Technician, including all mutations. |
| `/inventory/*`, `/leads/*`, `/documents`, `/mock/*` | Bearer JWT required; Admin. |

A local harness can POST a privately saved JSON sign-in body with
`Content-Type: application/json` and the configured `Origin`, retain the
`Set-Cookie` value, then GET `/auth/token` using that cookie. Supply the resulting
token to the business endpoints. Do not print passwords, cookies or tokens in
logs or commit them. Requests without a valid JWT return 401; a valid Technician
JWT on an Admin route returns 403. Auth validation/storage failures return 503
rather than silently granting access.

## Database and Realtime privacy

Browser roles have no access to public auth or customer/booking tables,
lead tables or inventory rows/RPCs. Supabase's service-role key stays in NestJS.
The inventory privacy migration removes anonymous row SELECT and the inventory
Postgres Changes publication. A statement trigger emits `inventory_changed` on
public topic `inventory` with an empty application payload; clients invalidate
and refetch through the protected API. No inventory rows are broadcast.

Appointment Broadcasts retain only the affected dealership-local date. These
public channels intentionally reveal that some activity occurred, and date-only
availability changes. Supabase adds a generated message UUID as transport
metadata. Notifications grant no access to protected data; authoritative reads
still pass through NestJS.

## Verification and limits

The isolated PostgreSQL suite exercises real Better Auth sign-in and signing,
JWT expiration/signature/issuer/audience checks, current roles, revoked sessions,
origin rejection, disabled signup, role escalation, hashed passwords and schema
grants. HTTP fixtures check default-deny staff routes and public guests. React
checks cover direct-route gating, role navigation, renewal deduplication,
concurrent 401s, logout races and same-user sign-in after session expiry. Live
checks are recorded separately in `exports/staff-auth-checks.json`.

Opt-in inventory WebSocket checks also require `RUN_INVENTORY_LIVE=1`,
`INVENTORY_TEST_URL`, `INVENTORY_TEST_ANON_KEY`,
`INVENTORY_TEST_SERVICE_ROLE_KEY`, `INVENTORY_TEST_API_ORIGIN` and a fresh Admin
`INVENTORY_TEST_ACCESS_TOKEN`. They create and clean up one owned fixture and
verify two independent subscriptions, protected persistence and edit conflicts.
The read-only benchmark requires `INVENTORY_BENCHMARK_ACCESS_TOKEN`. The historical
`inventory-benchmark-results.json` predates authentication; the current
`inventory-performance-before.json` and `inventory-performance-after.json`
compare the protected API with JWT/session/current-role checks enabled.

No MFA, email verification/recovery delivery, staff-management screen or external
identity provider is included. Local credentials and HTTP are for fictional demo
data. The per-request database session/role check favors immediate revocation;
load-test this path before scaling and retain its revocation semantics when
introducing caching. The local proxy currently falls back to a shared per-path auth rate-limit bucket
when a client IP cannot be resolved. Configure explicitly trusted proxy/IP
forwarding before exposing it to multiple remote users. Dedicated structured
logs, metrics and tracing remain a
separate observability task; never log passwords, bearer tokens or cookies.

Implementation follows the pinned Better Auth 1.7.12 package and official
[JWT](https://better-auth.com/docs/plugins/jwt),
[Admin](https://better-auth.com/docs/plugins/admin),
[PostgreSQL](https://better-auth.com/docs/adapters/postgresql) and
[Express integration](https://better-auth.com/docs/integrations/express) documentation.

## Unified identities

Better Auth maps its user model to `public.users`. Customers default to `customer`; trusted staff provisioning creates `admin` or `technician` roles. Staff APIs reject customer roles even when a JWT claims a staff role. Sessions and accounts reference the same text user IDs as bookings, vehicles and qualifications. Existing UUID IDs remain their string equivalents.

Legacy technician profiles have NULL email and phone and no password account, so they cannot sign in until explicitly provisioned. They are not matched to staff by name. Staff/customer records with the same normalized email are merged using the existing staff ID; existing customer phone details and submitted booking contact snapshots are retained. Guest booking reuses users by email without changing names, roles or credentials. Role changes and bans immediately affect staff authorization and technician allocation. Qualifications are still required for assignment.
