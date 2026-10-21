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
  const response = await fetch("/api/inventory" + path, { ...init, signal });
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
export async function getInventory(signal?: AbortSignal) {
  return parseSnapshot(await request("", { signal }));
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
