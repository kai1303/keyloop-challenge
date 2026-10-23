import { afterEach, expect, it, vi } from "vitest";
import { normalizeVin, searchDocuments } from "./documents-api";
import { result, VIN } from "./documents-fixture";
afterEach(() => vi.unstubAllGlobals());
it("normalizes input and requests the aggregate HTTP endpoint", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(result)));
  vi.stubGlobal("fetch", fetcher);
  expect(normalizeVin(" " + VIN.toLowerCase() + " ")).toBe(VIN);
  expect(await searchDocuments(" " + VIN.toLowerCase() + " ")).toEqual(result);
  expect(fetcher.mock.calls[0][0]).toBe("/api/documents?vin=" + VIN);
});
it("rejects invalid VINs without a request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(searchDocuments("bad VIN")).rejects.toThrow(/17-character/);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  { ...result, vin: "WVWZZZ1JZXW000001" },
  { ...result, documents: [{ ...result.documents[0], source: "unknown" }] },
  {
    ...result,
    documents: [{ ...result.documents[0], issuedAt: "2026-02-30" }],
  },
  {
    ...result,
    sources: {
      ...result.sources,
      service: { label: "Service System", status: "ok", count: 20 },
    },
  },
  {
    ...result,
    sources: {
      ...result.sources,
      service: { label: "Service System", status: "unavailable", count: 1 },
    },
  },
])("rejects malformed aggregate data", async (body) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
  );
  await expect(searchDocuments(VIN)).rejects.toThrow(
    /Invalid document response/,
  );
});
it("shows the safe backend failure message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "All document systems are unavailable. Please try again.",
        }),
        { status: 502 },
      ),
    ),
  );
  await expect(searchDocuments(VIN)).rejects.toThrow(
    "All document systems are unavailable. Please try again.",
  );
});

it("loads all documents without a VIN filter and preserves each vehicle VIN", async () => {
  const all = {
    ...result,
    vin: null,
    documents: result.documents.map((doc, index) => ({
      ...doc,
      vin: index ? "WDBRF40J93F000001" : VIN,
    })),
  };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(all)));
  vi.stubGlobal("fetch", fetcher);
  expect(await searchDocuments("   ")).toEqual(all);
  expect(fetcher.mock.calls[0][0]).toBe("/api/documents");
});
it("validates each document VIN when loading all vehicles", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...result,
          vin: null,
          documents: [{ ...result.documents[0], vin: "invalid" }],
        }),
      ),
    ),
  );
  await expect(searchDocuments("")).rejects.toThrow(
    /Invalid document response/,
  );
});

it("accepts a third registered source with its label and preview content", async () => {
  const finance = {
    ...result.documents[0],
    id: "finance:101",
    source: "finance",
    title: "Finance agreement",
  };
  const body = {
    ...result,
    documents: [...result.documents, finance],
    sources: {
      ...result.sources,
      finance: { label: "Finance System", status: "ok", count: 1 },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
  );
  expect(await searchDocuments(VIN)).toEqual(body);
});

vi.mock("../../auth/authenticated-fetch", () => ({ authenticatedFetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
