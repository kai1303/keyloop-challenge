# Consolidate application tables into public

Goal: move scheduler and staff_auth application objects into public without merging distinct records or changing API contracts.

Design: preserve historical migrations and append a transactional forward migration to both TypeORM entry points. Rename scheduler.vehicles to booking_vehicles before moving it; all other table names remain unchanged. Preserve row identities, foreign keys, indexes and trigger attachments with ALTER TABLE SET SCHEMA. Move the booking trigger function, deny browser access to moved tables/functions, enable RLS, and remove empty custom schemas without CASCADE. Supabase platform schemas remain platform-owned. Auth uses public search_path and its existing table names.

1. Add a regression test that expects current application tables in public; verify the failure before implementing.
2. Implement and register the forward migration; update booking queries, auth SQL/search_path and catalog seed. Keep customer/stock vehicles separate.
3. Update integration fixtures, legacy migration test adapters, current setup documentation and shared-database checks.
4. Verify upgrade and fresh setup in disposable PostgreSQL, including real auth, booking concurrency, row preservation, table conflicts, RLS/ACLs and Realtime. Run API/web tests, lint and builds.
5. Before local cutover, stop API writers, back up and restore-verify the local shared database. Run only the pending forward migration, compare application table hashes, restart and verify authenticated paths. Never reset the shared database or modify Supabase platform schemas.
