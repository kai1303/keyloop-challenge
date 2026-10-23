# Inventory server query implementation plan

Execute inline in the shared checkout; preserve unrelated and untracked work. Build and functionally verify first. Do not seed a large benchmark dataset or claim performance results.

**Design:** A validated InventoryQuery combines make/model/age/action filters, ordered sort keys, page size and opaque cursor. Nest maps the request to a parameterized Supabase RPC. PostgreSQL filters, orders and seeks after all cursor keys plus the unique ID; it returns one extra row to indicate another page. No OFFSET or per-page exact count. Age is based on the dealership date; >90 remains strict. Cursor contents are validated and bound to the filters/sort/page size. Defaults: oldest first, 25 rows; maximum 100 rows and three user sort keys.

The independent metadata endpoint returns dealership-wide summary and distinct make/model options, never inferred from a page. Vehicle-by-ID reads preserve action conflict recovery. Existing action writes and optimistic version checks remain. TanStack Table renders server-provided rows without locally filtering/sorting a partial page. TanStack Query owns request keys, cancellation, retained data and caches. Supabase WebSocket invalidations refresh active page and metadata while preserving query controls. Changing query settings resets cursor history. Page controls offer Previous/Next and page size, with secondary sort options in column menus. Aging row highlights and stable loading layout remain.

- [x] Add failing query validation/cursor tests. Implement query parsing and cursor codec.
- [x] Add parameterized SQL keyset RPC, metadata RPC and targeted indexes; verify only on the existing local Supabase with rollback-safe fixture checks.
- [x] Add paged list, metadata and vehicle-by-ID service/controller paths; test HTTP validation and error handling.
- [x] Add TanStack server table state and TanStack Query provider/hook; update response parsing and action conflict reload callers.
- [x] Test combined filters, multi-sort ties, 90/91-day boundary, cursor traversal, query reset, cancelled requests and global summary independence. Preserve filters on Realtime invalidation.
- [x] Run relevant unit/HTTP/database functional checks, typecheck, lint and build. Verify browser controls and screenshots; stop before benchmarking.

**Limits to state:** Cursor pages represent a live dataset, not a frozen snapshot. Indexed paths cover common stock-date/price queries, not every possible sort combination. Metadata aggregation still has a dataset-dependent cost; benchmark and tune it next. This remains the existing one-dealership local demo.

## Execution evidence

- Local migration applied transactionally to `supabase_db_keyloop-inventory-local`
  and recorded in migration history. Existing 24 inventory rows/actions retained.
  `supabase/tests/inventory-query.sql` passed with rolled-back owned fixtures,
  checking mixed sort ties, cursor traversal, combined predicates, 90/91-day
  boundaries, global metadata and anonymous RPC denial.
- Actual API traversal across 10 sort modes matched the reference ordering with
  no duplicate or omitted IDs in the unchanged 24-row dataset. This was a
  correctness check, with no latency or scale claim.
- `pnpm test`: API 68 passed; web 127 passed, 3 opt-in live checks skipped.
  Those 3 live checks passed separately against local Supabase, covering saved
  actions, optimistic conflicts and two independent WebSocket clients; owned
  fixture cleanup completed. HTTP E2E: 22 passed across 3 files.
- `pnpm build`, `pnpm typecheck`, configured `pnpm lint`, and
  `git diff --check` passed. Dashboard tests passed again after correcting test
  query option types found by the production build.
- Browser verified 10-row Next/Previous pages, filter-driven page reset,
  Toyota + aging + secondary price-descending sorting, unchanged global totals,
  retained aging highlights and 320px viewport containment. Screenshot:
  `exports/inventory-server-pagination.png`. Temporary viewport overrides and
  the test tab were removed.
- No million-record seed, load test or benchmark was run.
