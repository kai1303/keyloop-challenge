# Former scheduler project (rollback only)

The application now uses the root Supabase project `keyloop-inventory-local`
for every scenario. Do not start this second project during normal development.
The retained configuration and old data volume allow recovery; see
[the database merge runbook](../../docs/database-merge.md). Never switch back
after new merged-database writes without reconciling the scheduler data.
