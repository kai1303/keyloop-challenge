import { authenticatedFetch } from "../../auth/authenticated-fetch";
import {
  DEFAULT_INVENTORY_QUERY,
  inventorySearchParams,
  parseInventoryMetadata,
  type InventoryQuery,
  type InventoryPage,
} from "./inventory-query";
import { createClient } from "@supabase/supabase-js";
import {
  parseSnapshot,
  parseVehicle,
  type ActionDraft,
} from "./inventory-model";

export class InventoryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const timeout = AbortSignal.timeout(10000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const response = await authenticatedFetch("/api/inventory" + path, { ...init, signal });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "Unable to complete the inventory request. Please retry.";
    throw new InventoryError(message, response.status);
  }
  return data;
}
export async function getInventory(
  query: InventoryQuery = DEFAULT_INVENTORY_QUERY,
  signal?: AbortSignal,
): Promise<InventoryPage> {
  const body = await request("?" + inventorySearchParams(query), { signal });
  const snapshot = parseSnapshot(body);
  const page = body as InventoryPage;
  if (
    !Number.isInteger(page.pageSize) ||
    page.pageSize < 1 ||
    page.pageSize > 100 ||
    snapshot.vehicles.length > page.pageSize ||
    !(
      page.nextCursor === null ||
      (typeof page.nextCursor === "string" &&
        /^[A-Za-z0-9_-]{1,4096}$/.test(page.nextCursor))
    )
  )
    throw new Error("Inventory service returned an invalid page");
  return { ...snapshot, pageSize: page.pageSize, nextCursor: page.nextCursor };
}
export async function getInventoryMetadata(signal?: AbortSignal) {
  return parseInventoryMetadata(await request("/metadata", { signal }));
}
export async function getVehicle(id: string, signal?: AbortSignal) {
  return parseVehicle(await request("/" + encodeURIComponent(id), { signal }));
}
export async function saveAction(id: string, draft: ActionDraft) {
  return parseVehicle(
    await request("/" + encodeURIComponent(id) + "/action", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }),
  );
}
export function inventoryRealtimeClient() {
  const url = import.meta.env.VITE_INVENTORY_SUPABASE_URL;
  const key = import.meta.env.VITE_INVENTORY_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error(
      "Configure local Supabase to enable inventory and live updates",
    );
  const parsed = new URL(url);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Inventory Realtime must use a loopback URL for this demo");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
