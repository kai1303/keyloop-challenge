import type { InventoryPage, InventoryMetadata } from "./inventory-query";
export interface InventoryState {
  data: InventoryPage | null;
  metadata: InventoryMetadata | null;
  connection: "Connecting" | "Live" | "Reconnecting" | "Disconnected";
  stale: boolean;
  loading: boolean;
  updating: boolean;
  placeholder: boolean;
  error: string | null;
  lastUpdated: string | null;
}
export const INITIAL_INVENTORY: InventoryState = {
  data: null,
  metadata: null,
  connection: "Connecting",
  stale: true,
  loading: true,
  updating: false,
  placeholder: false,
  error: null,
  lastUpdated: null,
};
