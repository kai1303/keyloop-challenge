# Document Data Layers Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline in the current session. Preserve existing untracked application files and unrelated changes.

**Goal:** Separate document fetching/normalization from aggregation without changing the API or UI.

**Architecture:** `DocumentSourcesClient.load(source, vin)` owns HTTP, timeouts, local source configuration and mapping into `VehicleDocument[]`. `DocumentsService.search(input)` owns input validation, parallel orchestration, merge, newest-first sorting with ID tie-breaking, source counts and safe failure responses. Move source payload parsing from the shared model into `document-normalizer.ts`. The controller still depends only on DocumentsService.

**Tech Stack:** NestJS dependency injection, TypeScript, native fetch, Vitest and Supertest. No new dependencies.

## Scope and alternatives

The requested two-layer structure is implemented for the current Documents feature. Keeping HTTP inside DocumentsService would leave the responsibilities mixed. A generic project-wide adapter framework adds unrequested scope; Inventory, Bookings and Leads stay unchanged. Both filtered and default all-document modes, source IDs, payload validation, timeout/redirect protections and partial failures must retain current behavior.

## Task 1: Define the boundaries through tests

Files: `apps/api/src/documents/documents.service.spec.ts`, new `apps/api/src/documents/document-sources.client.spec.ts`.

- [x] Add a test that instantiates `new DocumentsService({ load })` using normalized documents, holds both source promises until both calls start, then checks newest-first ordering and equal-date ID ordering without mutating input arrays. Example assertion: `expect(result.documents.map(doc => doc.id)).toEqual(['service:101', 'sales:101', 'sales:102'])`.
- [x] Run `pnpm --filter @keyloop-interview/api exec vitest run src/documents/documents.service.spec.ts`. Confirm the boundary test fails because the existing constructor accepts HTTP configuration and never calls `load`.
- [x] Preserve existing mapping, HTTP failure, validation, all-mode, and configuration tests, updating their construction to `new DocumentsService(new DocumentSourcesClient(config))`. Add isolated client tests for normalized Sales/Service output, all-mode routes, malformed payload rejection and HTTP failure.

## Task 2: Move I/O and normalization out of aggregation

Files: new `apps/api/src/documents/document-sources.client.ts`, new `apps/api/src/documents/document-normalizer.ts`; modify `document-model.ts`, `documents.service.ts`, `documents.module.ts`, `apps/api/test/documents.e2e-spec.ts`.

- [x] Move `DOCUMENT_SOURCES`, `DocumentSources`, `createDocumentSources` and HTTP load code into DocumentSourcesClient. Keep timeout, Accept header, redirect rejection, URL restrictions and payload validation intact.
- [x] Move `mapDocuments` and its private record/text/date helpers into document-normalizer.ts; import normalizeVin and model types from document-model.ts. Keep the model's public types and normalizeVin unchanged.
- [x] Inject DocumentSourcesClient into DocumentsService; replace `this.load(...)` with `this.sources.load(...)`. Keep existing validation, parallel Promise.allSettled, merge, sorting, safe 502 and source metadata in DocumentsService.
- [x] Register DocumentSourcesClient in DocumentsModule. Import source configuration from its new file in the module and HTTP test. Update all direct service constructors in tests. Do not add compatibility re-exports for these internal symbols.
- [x] Run `pnpm --filter @keyloop-interview/api exec vitest run src/documents` and `pnpm --filter @keyloop-interview/api test:e2e`. Expect all unit and HTTP scenarios to pass.

## Task 3: Document and verify

Files: `apps/api/README.md` and this execution record.

- [x] Document the two-layer request flow and file responsibilities.
- [x] Run `pnpm --filter @keyloop-interview/api typecheck`, `pnpm --filter @keyloop-interview/api lint`, `pnpm --filter @keyloop-interview/api build`, and `git diff --check`.
- [x] Query the running local API with no VIN and a known VIN. Expect eight documents across three vehicles by default, four for the example VIN, newest first, with unchanged source counts and preview content.
- [x] Review imports to confirm DocumentsService no longer knows fetch, source URLs or upstream payload formats. Leave changes uncommitted because the surrounding application baseline is untracked and shared with other work.

## Execution record

Completed inline. The new aggregation test first failed against the combined HTTP/service constructor, then passed after client injection. Document unit tests: 18 passed. HTTP tests: 16 passed, including concurrent requests, timeout and partial-failure scenarios. API typecheck, lint, build and git diff --check passed. The running API returned eight documents across three VINs by default and four for the example VIN, newest first, with source counts and preview content intact. No frontend behavior or data migration was required. Frontend tests were not rerun for this backend-only refactor. No commit was created; the existing untracked application baseline and unrelated changes were preserved.
