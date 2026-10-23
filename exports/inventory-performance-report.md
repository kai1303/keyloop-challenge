# Inventory performance follow-up

Authenticated local before/after comparison on **1,000,000 vehicles**. Baseline: 22 Oct 2026 13:43:19–22 Oct 2026 13:45:05. Updated run: 22 Oct 2026 13:46:57–22 Oct 2026 13:47:10 (Asia/Ho_Chi_Minh).

Both runs use the existing Admin session and fresh JWTs. NestJS signature, current-session and role checks stay enabled. Neither run seeds, deletes or edits vehicles. The original demo records matched their before/after checksum across both runs. The earlier `inventory-benchmark-results.json` is a separate historical unauthenticated run.

## Changes

- Added C-collation indexes for ascending vehicle order, descending vehicle order with ascending UUID tie-break, and registration order. Added a narrow `(stocked_on,current_action)` index for exact metadata counts.
- The inventory RPC now filters, orders and limits rows before converting the page to JSON. Computed-action sorts still scan records but avoid serializing a million discarded rows.
- The metadata function calculates the dealership cutoff once per call. Exact totals and make/model options remain fresh, with no time-based cache and no changes to midnight or Broadcast invalidation.
- The loading skeleton now uses the same title/action toolbar height and spacing as the loaded table. Measured table handoff movement changed from **25px to 0px**.

## API latency

14 cases, 2 warmups and 20 sequential samples per case. Median and nearest-rank p95, milliseconds. Timings include body read/JSON validation; failure responses are counted separately and excluded from latency percentiles.

| Case | Before median | After median | Before p95 | After p95 |
|---|---:|---:|---:|---:|
| Oldest first, 25 rows | 6.77 | 9.02 | 9.43 | 16.93 |
| Next cursor page | 6.77 | 7.92 | 10.76 | 9.22 |
| Cursor after 750,000 rows | 6.69 | 7.60 | 8.91 | 12.12 |
| Oldest first, 100 rows | 8.10 | 7.67 | 15.84 | 10.48 |
| Price ascending | 7.37 | 6.80 | 10.57 | 7.90 |
| Price descending | 6.58 | 7.49 | 8.24 | 11.25 |
| Vehicle ascending | 942.33 | 6.41 | 976.05 | 8.19 |
| Registration ascending | 887.11 | 6.52 | 966.20 | 8.95 |
| Computed action ascending | 906.38 | 109.30 | 985.38 | 158.25 |
| Toyota + aging + needs action | 6.10 | 6.48 | 8.30 | 8.04 |
| Make/model/aging/action + three sorts | 7.34 | 6.79 | 9.28 | 9.71 |
| Saved action + aging, price sort | 5.80 | 10.24 | 6.87 | 43.19 |
| Nonexistent make | 5.44 | 25.98 | 5.99 | 134.99 |
| Exact summary and make/model options | 512.10 | 63.81 | 729.21 | 160.27 |

The raw candidate run includes noisy tails in the cheap empty-filter and saved-action cases; those samples are retained. A separate isolated 20-sample check measured empty-filter median/p95 at 6.39/20.21 ms and saved-action at 13.26/32.13 ms. Shared-machine variability is a limitation; the extra checks do not replace the main run.

## Concurrent mixed requests

100 closed-loop requests per run at each concurrency. Same 10-case mixture as the baseline: indexed pages/prices, vehicle/action sorting, combined filters and metadata. These short bursts measure this workload; they are not sustained capacity or a production SLA.

| Concurrency | Before p95 ms | After p95 ms | Before completed req/s | After completed req/s | Before failures | After failures |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 3600.92 | 421.26 | 5.78 | 47.16 | 0 | 0 |
| 10 | 6289.19 | 729.50 | 8.42 | 58.20 | 1 | 0 |

The authenticated baseline completed 479/480 measured requests successfully; one computed-action sort returned HTTP 503 at 8,023.92 ms. Its underlying storage/auth error was safely hidden by the API, so this evidence does not prove the precise failure cause. The updated run completed **480/480** successfully with zero HTTP, timeout or response-validation failures.

## Verification

- Transactional SQL checks passed before/after the migration: cursor traversal across text/reverse/computed/mixed sorts, ties, combined filters, strict 90/91-day boundary, exact global metadata, an action write reflected immediately, and service-only RPC permissions. Owned fixtures and their Broadcast notifications rolled back.
- Additional authenticated API checks verified distinct correctly ordered first/next pages for vehicle descending, registration descending and computed-action descending with a secondary price sort.
- Expanded service-role `EXPLAIN (ANALYZE,BUFFERS)` shows vehicle/registration/deep-stock pages using the matching indexes and fetching 26 rows for a 25-row page. Metadata uses index-only scans on the stock/action and make/model indexes. Computed action still uses a dataset scan plus top-N sort. Direct expanded SQL may plan differently from nested RPCs; the actual HTTP samples above are authoritative for reported API latency.
- Browser measured the same table/card coordinates during loading and after data arrives. Artificial 750ms request latency exposed the handoff; it was restored afterward. This geometry check is not a CLS, INP or Lighthouse score. Actual ascending vehicle sorting rendered 25 rows with no alert.
- Scoped web tests: **21 passed**. API Inventory unit tests: **29 passed**. HTTP suite: **68 passed**. Web production build/typecheck and `git diff --check` passed.

## Remaining limits

- Exact metadata and computed-action ordering still have dataset-dependent scan cost. Arbitrary filter/sort permutations and deep mixed-direction cursors are not universally covered by an index.
- Four indexes increased local table/index size from 389,840,896 to 554,500,096 bytes (**157.0 MiB added**). Write throughput and the maintenance cost of these indexes were not benchmarked.
- Warm/mixed caches, synthetic distribution, 20 samples per sequential case, and a shared development machine. Login itself, cold caches, remote-network latency, browser paint/INP, sustained traffic and write contention were not benchmarked. Existing staff authorization was preserved.

## Files and reproduction

Apply `supabase/migrations/20261022000300_inventory_performance.sql` through the normal local migration workflow. It has been applied and recorded only on `keyloop-inventory-local`.

```sh
# Supply a fresh Admin access token privately as documented in docs/authentication.md.
INVENTORY_BENCHMARK_OUTPUT=inventory-performance-repeat.json python3 supabase/tests/benchmark-inventory.py
```

- `exports/inventory-performance-before.json` and `exports/inventory-performance-after.json`: complete authenticated runs.
- `exports/inventory-performance-plans.json`: expanded SQL, plans and final indexes.
- `exports/inventory-performance-extra-checks.json`: reverse/mixed sorting and isolated spot checks.
- `exports/inventory-performance-browser.json`: measured loading geometry and UI sort checks.
- `exports/inventory-performance-updated.png`: current protected Inventory page.
- `supabase/tests/inventory-performance.sql`: rollback-safe functional and security regression checks.

References: [PostgreSQL ORDER BY indexes](https://www.postgresql.org/docs/17/indexes-ordering.html), [index collations](https://www.postgresql.org/docs/17/indexes-collations.html), [function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html).
