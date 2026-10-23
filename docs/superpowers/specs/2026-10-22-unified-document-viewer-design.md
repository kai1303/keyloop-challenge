# Unified Document Viewer — Scenario D

Date: 2026-10-22
Domain: Operate
Status: Implemented locally with list and in-app preview; verified by unit, HTTP and browser checks. See exports/document-viewer-checks.json.

## Required behavior

A manager enters one VIN and receives one consolidated list of vehicle documents
from the Sales System API and Service System API. The backend makes both HTTP
requests concurrently. Every document retains a visible source-system label.

## Existing application integration

Add `/admin/documents` beneath the existing persistent AdminLayout route in
`apps/web/src/AppRouter.tsx`. Add Documents to its shared navigation alongside
Bookings, Inventory and Sales Leads. Reuse the dark sidebar, React Router Link,
shadcn Input/Label/Button/Card/Table/Badge, the existing teal gradient for the
Search action, and the current Motion entrance/reduced-motion pattern. Keep the
page content light. Preserve existing feature state, database configuration,
untracked application files, and unrelated appointment work.

The core implementation needs no new database or runtime library. Document
records are fictional fixtures served by the mock systems. Supabase remains in
use by the existing inventory/leads features.

## HTTP aggregation

The browser submits `GET /api/documents?vin=<VIN>` through the existing Vite
`/api` proxy. NestJS exposes `GET /documents` and a dedicated DocumentsModule.
Normalize case and surrounding whitespace, then validate VIN length and allowed
characters before calling either upstream. The browser validates input too;
the backend remains authoritative.

For this local demo, host two distinct mock HTTP APIs under separate namespaces
in the Nest app: `/mock/sales/vehicles/:vin/documents` and
`/mock/service/vehicles/:vin/documents`. This keeps ordinary startup simple while
still making two real outbound HTTP requests from the aggregator. Keep the
Sales and Service payload shapes different so the adapters demonstrate real
normalization rather than concatenating identical fixtures. Use loopback base
URLs derived from the configured API port; configurable source base URLs remain
restricted to the local demo. Never accept an upstream URL from VIN input.

Start both fetches before awaiting either, using Promise.allSettled and a
bounded timeout for each request. Validate both upstream response shapes. Map
source-specific records into:

```ts
interface VehicleDocument {
  id: string;       // Namespaced by source, so matching upstream IDs do not collide.
  vin: string;
  title: string;
  type: string;
  issuedAt: string;
  source: 'sales' | 'service';
  content: string;  // Fictional plain-text document body for safe in-app preview.
}
interface DocumentSearchResult {
  vin: string;
  documents: VehicleDocument[];
  sources: {
    sales: { status: 'ok' | 'unavailable'; count: number };
    service: { status: 'ok' | 'unavailable'; count: number };
  };
}
```

Sort the merged list newest first, with source and ID as deterministic tie
breakers. Preserve separate documents from different systems, including records
with the same upstream ID or similar title. Adapters assign source labels; they
do not trust a source field supplied by an upstream response.

## Result and failure behavior

- Both sources succeed: return 200 and the combined result.
- A valid VIN has no documents: return 200 with an empty list and both sources OK.
- One source fails, times out, or returns malformed data: return 200 with the
  available documents and an explicit unavailable-source warning.
- Both sources fail: return a safe 502 error with a retry path.
- VIN is invalid: return 400 without calling either upstream.

A single source returning zero documents is still successful. A failed source
returning no documents is unavailable. Keep those states distinct in the UI.

## Search and consolidated view

Use a labelled VIN field and Search button. Include a visible fictional example
VIN that works with the fixtures. Do not perform a request on every keystroke.
On submit, show a loading state and replace the displayed result only for the
VIN that was submitted. Cancel or ignore an earlier search when a newer search
starts, preventing a slower old response from replacing the new result.

The consolidated table shows document title, type, issued date, and an explicit
Sales System or Service System source badge. Display the searched VIN and source
counts with the result. Show separate initial, loading, no-results, partial-data
and all-sources-unavailable states. Retain the VIN on error for easy retry.

The user selected a consolidated list with an in-app preview. A View document
button opens the shared Dialog with title, source, VIN, issue date and a readable
fictional document body. Render content as React text, never raw HTML. No PDF
engine, external iframe or download/upload workflow is needed for the mock demo.

## Fixtures

Provide fictional VINs covering documents from both sources, Sales only, Service
only, and no matches. Include different document types such as a sales invoice,
order confirmation, repair order and service invoice. Keep mock fixture dates
and IDs deterministic. Failure paths are exercised through test-owned HTTP
servers or adapter doubles rather than a user-facing developer control panel.

## Verification

- Unit tests cover VIN normalization/validation, source-specific mapping, source
  ID collisions, stable ordering and response validation.
- A concurrency test gates both upstream responses and verifies both requests
  have started before either is allowed to finish. Do not rely on flaky timing
  thresholds alone.
- HTTP tests use real local mock endpoints to verify combined results, empty
  results, one-source failures, timeouts, malformed upstream data and both-source
  failures. Test fixtures own and clean their servers.
- UI tests cover search submission, source labels, partial warnings, retry,
  retained input and out-of-order response protection.
- Browser checks cover the actual local search, combined source-labelled table,
  navigation without document reload, and narrow-layout containment.
- Run the appropriate web/API checks and report source/test/browser evidence
  separately. Do not claim mocked source checks prove production integration.

## Scope boundary

No production credentials, real dealership documents, document upload, editing,
OCR, background synchronization, authentication changes, or new database schema
are included. The approved preview shows fictional plain-text content.

## Default all-document list (22 October refinement)

The viewer loads all Sales and Service documents on mount. A missing or blank VIN
on `GET /documents` means all vehicles, with response `vin: null`; each document
retains its validated VIN. The backend concurrently calls `/mock/sales/documents`
and `/mock/service/documents` for this mode. Nonblank VIN searches retain the
existing validation and per-vehicle endpoints. Each table row shows its VIN;
**Show all documents** and a blank search restore the unfiltered list. Mock IDs
are unique within each system across all vehicles. Tests cover default loading,
VIN filtering/reset, all-mode concurrent requests and per-document VIN validation.

## Fetching/normalization and aggregation separation (22 October refinement)

`DocumentSourcesClient` owns source URL configuration and HTTP loading. Its
normalizer validates each system's payload and returns `VehicleDocument[]`.
`DocumentsService` owns search validation, parallel orchestration, safe partial
and total failures, merge, newest-first sorting with ID tie-breaking, and counts.
`DocumentsController` depends only on that aggregation service. Aggregation tests
can provide normalized documents without HTTP; client and HTTP tests retain
coverage for source formats, trust-boundary validation and concurrent requests.
This refinement applies to Documents; other dashboard domains are unchanged.

## Source factory and adapters (22 October refinement)

A `DocumentSourceAdapter` defines a source ID, display label, request path and
normalization method. Sales and Service implement it independently and reuse
common strict validation. `DocumentAdapterFactory` resolves registered stateless
instances and rejects invalid metadata, duplicate IDs and unknown sources.
`DocumentSourcesClient` loads a URL record keyed by source ID using these
adapters. The aggregator iterates configured sources in parallel; the response
includes dynamic labelled status/count metadata. The browser renders that
metadata instead of a fixed list. Source IDs and normalized fields remain
validated at both upstream and browser trust boundaries.

Adding a system requires one adapter, registration in `DOCUMENT_ADAPTERS` and a
matching configured URL. HTTP and UI tests cover a test-only Finance adapter
with a different URL and payload format, including all-document mode. There is
no new production integration, dependency or runtime plugin loader. The bounded
local demo supports up to 20 systems and 100 documents per system.
