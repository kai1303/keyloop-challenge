# Staff Authentication Implementation Plan

**Goal:** Better Auth JWT sign-in with Admin and full-booking Technician RBAC.

**Architecture:** Native Better Auth Express handler in NestJS; PostgreSQL
`staff_auth` schema; JWT plugin and current-session/role verification; React
login/session provider and authenticated fetch; sanitized inventory Broadcast.

**Tech Stack:** Better Auth 1.7.12, jose, existing pg/NestJS/React/Supabase.

- [x] Add pinned Better Auth and jose dependencies, inspect the installed adapter
  and JWT contracts, and retain one main frontend/API/database.
- [x] Add failing API regression tests for missing JWT/shared-key rejection and
  Admin/Technician route matrices; add frontend unauthenticated-route/proxy tests.
- [x] Configure Better Auth with private pg Pool, Admin/JWT plugins, disabled
  signup, trusted origins, rate limits and managed roles. Mount its handler before
  body parsers; add guards/decorators and JWT-authorized profile endpoint.
- [x] Add explicit TypeORM auth schema migration and isolated integration tests;
  verify JWT signing/session revocation/role changes and secure database grants.
- [x] Remove shared-key authentication/proxy injection; protect all staff and mock
  controllers; propagate JWT through local document sources. Retain public guests.
- [x] Add React login/session boundary, in-memory JWT renewal/deduplication,
  authenticated API helper, role-aware navigation/sign-out and cache clearing.
- [x] Replace anonymous inventory row access with sanitized Broadcast invalidation,
  update SQL/realtime tests, and retain authenticated reads through NestJS.
- [x] Add server-side initial-account provisioning, env examples, permission
  matrix, build/run/test instructions and updated architecture.
- [x] Back up and apply additive changes locally; verify Admin/Technician/guest
  browser and HTTP behavior with owner-private local demo credentials.
- [x] Run relevant regression/integration/build/type/lint checks and focused review;
  record verification and limits without exposing secrets or tokens.
