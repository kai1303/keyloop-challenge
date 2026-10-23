# Database consolidation and recovery

## Current application namespace (23 October 2026)

All application tables now use `public`. The forward TypeORM migration moves
existing scheduler and staff_auth tables without copying rows, retains their IDs,
foreign keys, indexes and triggers, and removes the empty custom schemas without
CASCADE. Customer service vehicles become `public.booking_vehicles`; inventory
remains `public.vehicles`. A subsequent identity migration consolidates customers, staff and technicians in
`public.users`; auth support tables (`session`, `account`, `verification`, `jwks`,
`rateLimit`) remain in public. Staff IDs, credentials and sessions are retained.
The separate `public.technicians` and `public."user"` tables are removed. All application identity
tables have RLS enabled and browser-role privileges revoked. Supabase platform
schemas remain managed by Supabase.

Use both current migration commands and `supabase/tests/shared-database.sql` for
setup and verification. Do not import the old scheduler schema into this layout.
Schema rollback requires the matching previous application and a verified backup,
with business writes paused and any newer records reconciled.

Local cutover backups and source snapshots are retained privately under
`.local/schema-merge/20261023T041228Z/`. Both a full database archive and an
application-only archive have SHA-256 checksums. The application archive was
restored into isolated PostgreSQL and migrated; all 18 application table hashes
matched the originals, including 1,000,000 inventory rows. The local cutover also
preserved table OIDs, staff sessions, and booking/resource versions. Restore
rehearsal omitted ownership/ACL restoration; current privacy was checked separately
through SQL and anonymous Data API requests. This is not a full Supabase platform
disaster-recovery test. Sanitized evidence is in
[public-schema-checks.json](../exports/public-schema-checks.json).

The `scheduler.timezone` transaction setting remains for compatibility with the
existing trigger body; it is a custom PostgreSQL setting, not a remaining schema.

The identity consolidation has a separate verified backup under
`.local/unified-users/20261023T044839Z/` and evidence in
[unified-users-checks.json](../exports/unified-users-checks.json). The local database
had 17 public tables including migration history and 7 unified users immediately after identity consolidation. Existing
staff IDs and auth support records are unchanged. Customer/staff email matches
prefer the staff ID; no such duplicates existed in the local cutover, and the
matching-email upgrade case was verified in disposable PostgreSQL. Legacy
technician names are not used to guess staff identities. Deactivate users through
roles/bans rather than deleting identities referenced by appointment history.

The subsequent `BookingResourceLocks1792800000002` migration removes only the
redundant `public.resource_slots` table. The current layout has 16 public tables,
including migration history. Occupancy comes from service_bookings; booking
writers lock existing technician users and bays before rechecking availability.
Old binaries must be stopped before this cutover. Its separate checksummed backup
and restore rehearsal are retained under
`.local/booking-resource-locks/20261023T055431Z/`; see
[booking-resource-locks-checks.json](../exports/booking-resource-locks-checks.json).

The sections below retain the evidence and recovery instructions for the earlier
22 October database consolidation; their old schema names describe that historical
cutover, not the current application layout.


The local application was consolidated on 22 October 2026 into the retained
Supabase project `keyloop-inventory-local`: Data API 55321, PostgreSQL 55322,
Studio 55323. The React frontend and NestJS API now use this one project.

| Schema | Records | Access |
| --- | --- | --- |
| `public` | Inventory vehicles, sales leads, activities | Backend Data API; anonymous inventory reads for the existing demo |
| `scheduler` | Customers, customer vehicles, bookings, services, technicians, qualifications, bays | Direct backend TypeORM transactions; not an exposed Data API schema |
| `public.appointment_scheduler_migrations` | TypeORM migration history | Browser roles denied, including the sequence |
| `supabase_migrations` | Inventory/lead migration history | Supabase CLI owned |

`public.vehicles` describes stock; `scheduler.vehicles` describes customer-owned
service vehicles. Their identities and relationships remain separate.

## Migration performed

The destination already held 1,000,000 inventory vehicles, 3 leads, and 4 lead
activities. The former scheduler held 4 bookings, 3 customers, 3 customer vehicles,
and the service/resource catalog. Keeping the destination avoided moving the
million-row stock table.

1. Stopped the main NestJS watcher and process to suspend application writes.
2. Saved full custom-format PostgreSQL dumps from both containers, plus private
   API/frontend environment snapshots. No reset or destructive restore was used.
3. Restored application schemas from both dumps into a separate disposable
   database on the dedicated PostgreSQL test fixture. A `realtime.send` stub was
   used only in that rehearsal database; no Supabase platform schemas were copied.
4. Compared all 12 original application/history tables by count and SHA-256 of
   canonical, sorted JSON rows. Every table matched the original snapshots.
5. Selected only `scheduler` objects and the appointment migration table and its
   sequence from the scheduler archive's table of contents. Imported those into
   the retained destination with `psql --single-transaction` and
   `ON_ERROR_STOP=1`. A guard refused an existing scheduler schema/history table.
   Private history grants were revoked before that transaction committed.
6. Rechecked all table hashes, then ran the new TypeORM migration which records
   the browser-role permission restriction. The five prior scheduler migration
   records are unchanged; this migration adds a sixth history record.
7. Updated `DATABASE_URL` to the retained project's SQL endpoint and both booking
   Realtime settings to its API URL and publishable key. Inventory/lead settings
   and browser anon keys also select this same project. Existing schedule timezone
   and hours were retained. Restarted the API; Vite reloaded its environment.
8. Verified all four scenario APIs, staff-key rejection, private Data API access
   denial, both WebSocket paths, and staff/guest browser views. Live no-op updates
   exercised committed triggers without changing application values or versions;
   inventory SQL tests rolled their fixture changes back.
9. Stopped the former `keyloop-interview` stack using `supabase stop` with its
   default backup behavior. Its data volume and configuration remain recoverable.

Only application objects were imported. Platform-owned Auth, Realtime, Storage,
roles, and project secrets were not overwritten. Both Auth user tables were
empty at inspection. The destination keeps its existing project keys.

## Backups and evidence

Private backups are under:

```text
.local/database-merge/20261022T050159Z/
  operations.dump
  scheduler.dump
  api.env
  web.env
  SHA256SUMS
  before.json
  restore-verification.json
  after-import.json
  scheduler-application.list
  scheduler-application.sql
```

The containing directories are owner-only; dumps, environment snapshots, and
extracted data files are mode 0600. `.local/` is ignored by Git. Do not publish
these artifacts or copy their contents into a submission. The SQL extraction
contains customer records. `web.env` is the original `apps/web/.env.local`;
other frontend env files were not edited.

Verify archive checksums without displaying their contents:

```sh
(cd .local/database-merge/20261022T050159Z && shasum -a 256 -c SHA256SUMS)
```

The rehearsal proves recovery of application schemas, rows, constraints, indexes,
functions, grants, and migration history. It does not prove a full Supabase
platform disaster recovery from these full logical archives. Original source
volumes remain retained in addition to the dumps.

Sanitized results are in [shared-database-checks.json](../exports/shared-database-checks.json).
The application Broadcast body contains only `date`; the installed Supabase
`realtime.send` function adds a generated message UUID as transport metadata.
Neither customer details nor booking identifiers are included.

## Fresh setup and verification

Use the root [README](../README.md) to start one project, run Supabase CLI
inventory/lead migrations, then run TypeORM Supabase migrations and the catalog
seed. Do not import the old scheduler archive into a fresh installation or into
an already migrated destination. Existing data import is a separate operation;
TypeORM applies only unapplied migrations; it does not import records from the
old project.

Read-only checks for the deployed shared schema:

```sh
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/shared-database.sql
```

Run destructive scheduler integration tests only through the guarded disposable
`scheduler_test` fixture on port 54329, never against the shared demo database.
Fresh-machine Supabase provisioning was not rerun as part of this cutover.

## Rollback

The original scheduler database remains a recovery copy. **Once a write reaches
the merged scheduler, the old database can be stale. Do not switch back blindly.**

Before any rollback, stop the unified API and take a new backup of the merged
scheduler state. If business writes occurred after cutover, reconcile those
records, versions, associations, and migration history before routing writes back.
Keeping the shared database and repairing the application is usually simpler.

If no business writes occurred since cutover, the previous route can be restored:

1. Create a separate loopback-bound network if absent, then start the retained
   old stack. Keep the shared inventory stack running, since Inventory and Leads
   still use it in the prior configuration:

   ```sh
   docker network inspect keyloop-appointments-local >/dev/null 2>&1 || \
     docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 keyloop-appointments-local
   supabase --workdir infra/appointments start --network-id keyloop-appointments-local
   ```
2. Copy `api.env` back to `apps/api/.env` and `web.env` back to
   `apps/web/.env.local`, using the private backup directory above. Preserve owner
   permissions. The earlier API environment used an externally supplied
   `PORT=3006`; start that API with the same port explicitly.
3. Restart the API and Vite, then verify booking reads/availability and Realtime
   before accepting writes. Current frontend preview uses 5176; clean setup uses
   5173. Keep the corresponding frontend origin.

There is no need to drop the copied scheduler schema or reset either project to
roll back application routing. Never use `--no-backup`, `--all`, or `db reset`
as part of this recovery procedure.

The archive restore uses PostgreSQL's selectable table-of-contents approach;
see [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html) and
[Supabase's backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Subsequent staff authentication

The merge evidence above describes its original verification run. Later staff
authentication adds private `staff_auth` tables and removes anonymous inventory
SELECT/Postgres Changes in favor of sanitized Broadcast. See
[authentication and RBAC](authentication.md) for current access rules and setup.
