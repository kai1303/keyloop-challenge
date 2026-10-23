# Document Source Factory Implementation Plan

> Execute inline using the existing two-layer document pipeline. Preserve unrelated and untracked application work.

**Goal:** Add a registry-backed adapter factory so new document systems do not require edits to aggregation or UI source lists.

**Design:** A DocumentSourceAdapter exposes id, label, request path and normalization into VehicleDocument[]. Sales and Service adapters map their respective payloads using the existing strict common validator. DocumentAdapterFactory validates its injected registry and resolves adapters by source ID. DocumentSourcesClient receives configured URLs keyed by source ID and uses the factory. DocumentsService iterates configured systems in parallel and builds labelled status/count metadata dynamically. The browser validates and renders that metadata for any registered system.

**Scope:** Existing default list, VIN search, preview, newest-first order, namespaced IDs, bounded requests, loopback-only demo URLs, partial failures and validation remain. No production third system is added. Registering another system is an explicit code/configuration change, with no new dependency or runtime plugin loading.

- [x] Add failing tests for factory resolution, duplicate/unknown registrations and a third adapter; add a frontend API test accepting a third source.
- [x] Extract Sales/Service adapters and common field validation. Add factory and Nest registry provider. Replace the fixed source URL properties with a URL record.
- [x] Make aggregation and source metadata dynamic; preserve safe all-source failures and deterministic sorting.
- [x] Update callers, configuration fixtures and UI response parsing/source labels. Add a third-source HTTP test and UI preview test.
- [x] Run document unit/UI tests, HTTP tests, typecheck, lint and build. Check live default/filtered responses and browser rendering.
- [x] Document exact registration steps and record verification. Do not broadly stage or commit the shared application baseline.

## Verification

- Watched the third-source frontend parser test fail before implementing dynamic sources; then verified it passes.
- Document unit tests: 25 passed; full API unit suite: 56 passed.
- Web tests: 110 passed, 3 unrelated opt-in inventory live tests skipped.
- HTTP tests: 18 passed, including a test-only Finance adapter in both VIN/all modes with a three-request response gate.
- Typecheck, lint (zero warnings/errors), production builds and git diff --check passed.
- Running API: 8 default documents and 4 for the example VIN, with dynamic labelled source metadata.
- Browser: default list, VIN filtering/reset, source-labelled preview and 320px containment passed; screenshot saved to exports/documents-source-factory.png.
- No new live source or dependency enabled. Shared application changes remain uncommitted.
