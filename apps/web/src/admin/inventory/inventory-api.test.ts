import { afterEach, expect, it, vi } from "vitest";
import {
  getInventory,
  inventoryRealtimeClient,
  saveAction,
} from "./inventory-api";
import { snapshot } from "./inventory-fixture";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("posts only the selected action, note, and expected version", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ...snapshot.vehicles[0],
        currentAction: "Monitor Stock",
        actionUpdatedAt: snapshot.serverTime,
        version: 1,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await saveAction(snapshot.vehicles[0].id, {
    action: "Monitor Stock",
    note: "weekly",
    expectedVersion: 0,
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    action: "Monitor Stock",
    note: "weekly",
    expectedVersion: 0,
  });
});
it("keeps HTTP status for conflict handling", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Review the latest vehicle" }), {
        status: 409,
      }),
    ),
  );
  await expect(getInventory()).rejects.toMatchObject({ status: 409 });
});
it("requires local public configuration instead of silently simulating live updates", () => {
  vi.stubEnv("VITE_INVENTORY_SUPABASE_URL", "");
  vi.stubEnv("VITE_INVENTORY_SUPABASE_ANON_KEY", "");
  expect(() => inventoryRealtimeClient()).toThrow(/Configure/);
  vi.stubEnv("VITE_INVENTORY_SUPABASE_URL", "https://remote.example.com");
  vi.stubEnv("VITE_INVENTORY_SUPABASE_ANON_KEY", "public-test-key");
  expect(() => inventoryRealtimeClient()).toThrow(/loopback/);
});

vi.mock("../../auth/authenticated-fetch", () => ({ authenticatedFetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
