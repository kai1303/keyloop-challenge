# Inventory benchmark — 1,000,000 vehicles

Run: **22 October 2026, 10:25:59–10:27:41 Asia/Ho_Chi_Minh**. The existing local Nest API on port 3006 read the local Supabase project `keyloop-inventory-local`. No application code, schema, index or vehicle data was changed for this baseline. Original demo rows matched their before/after checksum.

## Result

Indexed stock-date and price paths were fast. The tested combination of make/model/aging/action filters and three sorts was also fast. Vehicle, registration and computed-action sorts were much slower and dominated the mixed-load tail. Every measured request passed HTTP and response checks: **480 successes, 0 failures or timeouts**.

## Sequential HTTP latency

Each case had 2 warmups and 20 measured requests. p50 is the median; p95 is nearest-rank. Values below are milliseconds, including response body read and JSON validation. Successful-response latency only; failure counts are reported separately.

| Case | p50 ms | p95 ms | Max ms | Failures |
|---|---:|---:|---:|---:|
| Oldest first, 25 rows | 4.63 | 6.09 | 15.73 | 0 |
| Next cursor page | 4.04 | 4.84 | 5.16 | 0 |
| Cursor after 750,000 rows | 3.97 | 5.15 | 6.31 | 0 |
| Oldest first, 100 rows | 5.52 | 6.12 | 12.64 | 0 |
| Price ascending | 3.94 | 6.53 | 6.83 | 0 |
| Price descending | 3.99 | 4.81 | 5.11 | 0 |
| Vehicle ascending | 933.52 | 1338.45 | 3688.45 | 0 |
| Registration ascending | 876.72 | 894.55 | 895.59 | 0 |
| Computed current action ascending | 908.51 | 1043.67 | 1067.61 | 0 |
| Toyota + aging + needs action | 3.91 | 4.63 | 5.48 | 0 |
| Toyota + Corolla + aging + needs action; age desc, price asc, registration desc | 5.58 | 7.52 | 7.74 | 0 |
| Aging + Price Reduction Planned; price ascending | 3.98 | 6.12 | 10.84 | 0 |
| Nonexistent make (empty result) | 3.69 | 6.32 | 7.80 | 0 |
| Global summary + make/model options | 449.10 | 476.25 | 478.19 | 0 |

## Mixed concurrent requests

100 total requests at each concurrency level. The mix evenly repeats 10 cases: oldest first/next/deep cursor, ascending/descending price, vehicle sort, action sort, Toyota aging/no action, the combined three-sort case, and metadata. Each worker issues the next request only after its current request completes. These are short closed-loop bursts, not a maximum-capacity test.

| Concurrent requests | p50 ms | p95 ms | Max ms | Completed req/s | Failures |
|---|---:|---:|---:|---:|---:|
| 5 | 14.03 | 2430.49 | 4508.19 | 8.79 | 0 |
| 10 | 19.20 | 6128.72 | 7938.18 | 8.85 | 0 |

At concurrency 10, oldest-first p95 was 36.38 ms and the tested three-sort filtered query p95 was 74.31 ms. Vehicle and action sort p95 values were 7,345.27 ms and 7,938.18 ms respectively (only 10 observations each, so nearest-rank p95 is the maximum). Metadata p95 was 1,839.66 ms. The aggregate p95 of 6,128.72 ms therefore does not describe every query type. Throughput barely changed between concurrency 5 and 10, while the slow tail worsened.

## Database evidence

After the timed HTTP run, read-only `EXPLAIN (ANALYZE, BUFFERS)` ran on equivalent expanded RPC SELECTs as `service_role`. Supabase denied loading `auto_explain`, so these are direct-statement plans rather than captured nested PL/pgSQL plans. Direct statements may plan differently; SQL times below are diagnostic, not substitutes for the HTTP measurements.

- Oldest first used `vehicles_stock_cursor_idx`, fetching 26 rows for the 25-row page in 0.523 ms. The cursor after 750,000 rows used the same index, fetching 26 rows in 0.418 ms. Measured API pagination used no OFFSET; an untimed SQL OFFSET lookup prepared the deep boundary.
- Expanded vehicle, registration and computed-action sorts scanned about 1,000,000 rows across three parallel loops and used top-N heapsort. Their diagnostic execution times were 999.559, 895.043 and 999.357 ms. The LIMIT bounds the returned page, but these plans still inspect the full dataset.
- The tested three-sort filtered query used the stock cursor index and an incremental sort (3.212 ms): 84 qualifying rows produced, 1,287 removed by filter at the scan, then a 26-row limit. This evidence covers this particular query and seed distribution, not every filter/sort combination.
- Expanded metadata scanned the table for counts and the make/model index for distinct options (220.735 ms direct SQL versus 449.10 ms median through the actual HTTP/RPC path). Both operations inspect roughly a million rows even though the response is only 481 bytes.

## Next tuning priorities

1. Add indexes that match the text ORDER BY keys, `COLLATE "C"` and ID tie-break. Existing registration/make-model indexes use the default collation and do not satisfy these observed text sort paths. Test mixed ASC/DESC directions rather than assuming one index covers all combinations.
2. Reduce repeated full-dataset summary/options work with a freshness-aware cache or maintained aggregate; preserve correct midnight aging and action-save invalidation. Action-label sorting needs a separate design because the displayed fallback depends on stock age.
3. Rerun the same benchmark after each change. Do not add indexes for every possible permutation without workload evidence.

PostgreSQL references: [indexes and ORDER BY](https://www.postgresql.org/docs/17/indexes-ordering.html), [matching index collations](https://www.postgresql.org/docs/17/indexes-collations.html), and [interpreting EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html).

## Scope and limits

- Host: MacBookPro18,3, 8 logical CPUs and 32 GiB RAM. Docker VM: 8 CPUs, 8 GiB RAM. PostgreSQL 17.6, shared_buffers 128 MiB, work_mem 4 MiB, max_parallel_workers_per_gather 2. Existing compiled Nest process and other local services remained running.
- Synthetic inventory: 12 makes, 36 make/model pairs, weighted makes, 0–730 stock days, repeated prices/ages and saved/missing actions. Vehicle table plus indexes was 389,824,512 bytes at preflight. Seed data is not production traffic.
- Warm/mixed shared cache; no OS/DB cache eviction. Python stdlib urllib creates a new HTTP request for each sample rather than pooling client connections. Client timeout was 10 seconds. Warmups and setup requests were excluded from the 480 measured requests.
- This is a small local baseline. Twenty sequential samples per case and two short bursts cannot establish a production SLA, sustained capacity or robust tail latency. No browser paint/React render, WebSocket propagation, write contention, cold-cache or network-distance benchmark was performed.

## Reproduce / raw evidence

```sh
python3 supabase/tests/benchmark-inventory.py
```

- `supabase/tests/benchmark-inventory.py`: read-only runnable benchmark; percentile self-checks, response/filter/order checks, distinct first/next pages and preserved baseline checksum.
- `exports/inventory-benchmark-results.json`: complete request latencies, statuses, sizes, cases and environment.
- `exports/inventory-benchmark-plans.json`: expanded SQL, full JSON plans and existing index definitions.
- `exports/inventory-benchmark-plans.log`: denied nested-plan capture attempt, retained to make the evidence boundary explicit.
