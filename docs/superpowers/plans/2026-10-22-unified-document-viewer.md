# Unified Document Viewer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; the user previously selected inline execution. Preserve unrelated working-tree changes and existing preview processes.

**Goal:** Search one VIN, aggregate Sales and Service HTTP APIs concurrently, and preview each source-labelled document in the admin app.

**Architecture:** A Nest DocumentsModule fans out to two local mock HTTP namespaces with different schemas. It validates and normalizes the results into one contract, preserving partial availability. React adds a Documents route to the persistent shared layout and renders a shadcn table plus safe text previews in Dialog.

**Tech Stack:** Existing React, React Router Link, Motion, shadcn, NestJS, Node fetch, Vitest, Supertest. No new dependencies or database changes.

## 1. API contract and aggregation

Files: create `apps/api/src/documents/document-model.ts`, `mock-documents.ts`, `documents.service.ts`, `documents.controller.ts`, `documents.module.ts`, `documents.service.spec.ts`; modify `apps/api/src/app.module.ts`.

- [x] Write failing tests for VIN normalization, validation before fetch, genuine concurrent calls, namespaced IDs, source mapping, stable ordering, partial failures, timeouts and malformed responses. Run `pnpm --filter @keyloop-interview/api test src/documents/documents.service.spec.ts`; expect missing implementation failure.
- [x] Normalize VIN with trim/uppercase and `/^[A-HJ-NPR-Z0-9]{17}$/`. Fetch both sources using `Promise.allSettled([loadSales(vin), loadService(vin)])`, each with `AbortSignal.timeout(3000)` and `redirect: 'error'`. Assign source in each adapter and prefix IDs with `sales:` or `service:`. Validate metadata, VIN association, date, document IDs and bounded plain-text bodies.
- [x] Serve deterministic fictional Sales and Service fixtures at `/mock/sales/vehicles/:vin/documents` and `/mock/service/vehicles/:vin/documents`. Configure source base URLs through the local API port or loopback-only overrides. Invalid VIN: 400; both sources fail: safe 502; one source fails: 200 with explicit unavailable status; unknown VIN: 200 with no documents.
- [x] Run the unit checks, API typecheck and lint.

## 2. Real HTTP contract verification

File: create `apps/api/test/documents.e2e-spec.ts`.

- [x] Test actual HTTP requests to both mocked namespaces, response mapping and preview content, source ID collisions, empty results, one-source failure, both failures, timeout, malformed payloads and invalid VIN. Use owned loopback HTTP servers and clean them after each suite.
- [x] Gate both mock requests: record each arrival and release both only after two arrivals. This proves concurrent dispatch without an elapsed-time assertion.
- [x] Run `pnpm --filter @keyloop-interview/api test:e2e`; expect existing and new HTTP tests to pass.

## 3. Search UI and previews

Files: create `apps/web/src/admin/documents/documents-api.ts`, `DocumentsDashboard.tsx`, `documents.css`, `DocumentsDashboard.test.tsx`, `documents-api.test.ts`.

- [x] Write failing tests for normalized search submission, source-labelled results, readable preview, Escape/focus restoration, no-results, partial warnings, retry and a slower previous search being ignored.
- [x] Validate the browser response at its trust boundary. Submit only on search/example activation, retain the input on failure, and use AbortController plus a request sequence to ignore obsolete promises. Display initial/loading/empty/partial/error states separately.
- [x] Render document title/type/date/source in one shared Table; open a Dialog with a safe plain-text article. Use the existing teal gradient on primary actions, current header/board Motion entrance and reduced-motion handling.
- [x] Run focused UI/adapter tests and web typecheck.

## 4. Navigation, documentation and acceptance

Files: modify `apps/web/src/AppRouter.tsx`, `AppRouter.test.tsx`, `apps/web/src/admin/AdminLayout.tsx`, `AdminLayout.test.tsx`, root/API/web READMEs and environment examples if needed. Create `exports/document-viewer-checks.json` and a screenshot.

- [x] Add Documents to the dark shared sidebar with React Router Link and `/admin/documents` beneath the persistent layout route. Preserve all existing routes and active-link behavior.
- [x] Document mock URLs, example VINs, local startup, source timeout and preview limitations. Keep actual environment values and other feature credentials unchanged.
- [x] Verify the running UI on port 5176 and API on 3006: search the example, confirm both sources, open/close preview, verify unknown VIN and 320px containment, and confirm switching admin sections keeps the same document.
- [x] Run `pnpm --filter @keyloop-interview/api test`, `test:e2e`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm lint` and `git diff --check`. Record actual outcomes and distinguish mocked-source proof from production integration.

No subagents, production infrastructure changes, real dealership files, database changes or broad staging. New document-owned source may be committed separately; pre-existing untracked application files and concurrent work remain preserved.

## Completed execution

Implemented inline and verified on 2026-10-22. The existing local API on 3006 and
Vite preview on 5176 serve the feature. The example VIN returns four documents
(two per source) and readable in-app previews. Both HTTP requests were proven
concurrent with a response gate, not a timing estimate. One-source failures,
timeouts, malformed payloads, empty results, safe preview rendering and stale
search protection are covered by actual HTTP and/or UI tests.

Final workspace checks: 104 web tests passed (3 unrelated opt-in Supabase tests
skipped), 41 API unit tests and 14 API HTTP tests passed. Typecheck, both app
builds, lint (zero warnings/errors) and diff whitespace checks passed. Browser
proof covers both sources, preview, Escape, unknown VIN, persistent navigation
and 320px document/modal containment. Evidence is in
`exports/document-viewer-checks.json`; screenshots are `document-viewer.png`,
`document-preview.png` and `document-preview-mobile.png`.

Pre-existing untracked app/configuration files and unrelated appointment/inventory
changes were preserved. Shared integration edits remain in the working checkout;
no broad staging, commit of an incomplete baseline, database reset or production
change was performed. Preview and existing local services remain running.
