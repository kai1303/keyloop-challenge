import { afterEach, expect, it, vi } from "vitest";
import { listLeads } from "./leads-api";

vi.mock("../../auth/authenticated-fetch", () => ({
  authenticatedFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
afterEach(() => vi.unstubAllGlobals());
it("requests a bounded page and safely encodes its continuation cursor", async () => {
  const page = { leads: [], nextCursor: null };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)));
  vi.stubGlobal("fetch", fetcher);
  expect(await listLeads(undefined, "next/+=")).toEqual(page);
  expect(fetcher.mock.calls[0][0]).toBe(
    "/api/leads?limit=50&after=next%2F%2B%3D",
  );
});
it.each([[], { leads: [], nextCursor: 42 }, { leads: null, nextCursor: null }])(
  "rejects malformed page metadata: %j",
  async (page) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(page))),
    );
    await expect(listLeads()).rejects.toThrow("Invalid lead page response");
  },
);
