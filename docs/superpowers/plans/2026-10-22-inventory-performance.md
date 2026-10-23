# Inventory performance follow-up

Scope: the existing authenticated Inventory route and its million-row local
dataset. Preserve authentication, action versions, exact >90-day aging,
WebSocket invalidation and all existing records. Do not seed/reset data.

1. Capture a fresh 480-request authenticated baseline; keep the earlier
   unauthenticated benchmark as separate historical evidence.
2. Check current query plans. Add matching C-collation text-sort indexes and
   defer JSON conversion until after the page LIMIT. Optimize exact metadata
   computation only where measured; do not add a stale summary cache.
3. Align the loading toolbar/table geometry with the updated loaded toolbar.
   Keep the existing loading and background-refresh behavior.
4. Verify SQL ordering and cursor traversal (including ties, reverse/multiple
   sorts, computed action labels and the 90/91-day boundary), metadata freshness
   and database privileges. Apply only to the identified local project.
5. Repeat the same authenticated benchmark, compare results, and verify the
   browser filters/pagination and loading layout. Run scoped web/API tests and
   build checks. Preserve complete baseline/candidate samples and limitations.

Chrome DevTools MCP is unavailable; use the available browser developer capability
for browser checks and actual API/database timings. Do not claim Lighthouse or
field Core Web Vitals results.

## Completed

- Captured fresh protected-API baseline and candidate runs in
  `exports/inventory-performance-before.json` / `inventory-performance-after.json`.
- Added four targeted indexes, deferred page JSON serialization and a per-call
  metadata cutoff. Applied/recorded migration 20261022000300 locally.
- SQL functional/security regressions pass with rolled-back fixtures. The full
  million-row dataset and original demo checksum are preserved.
- Browser handoff movement: 25px before, 0px after. Sorting renders correct rows.
- Web 21 tests, Inventory API 29 tests, HTTP 68 tests and web production build
  passed. Network/device overrides restored; temporary session material removed.
- Results and limits: `exports/inventory-performance-report.md`.
