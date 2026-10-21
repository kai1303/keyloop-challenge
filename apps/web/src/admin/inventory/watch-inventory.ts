import type { SupabaseClient } from "@supabase/supabase-js";
import { getInventory } from "./inventory-api";
import { midnightDelay, type InventorySnapshot } from "./inventory-model";

export interface InventoryState {
  data: InventorySnapshot | null;
  connection: "Connecting" | "Live" | "Reconnecting" | "Disconnected";
  stale: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}
export const INITIAL_INVENTORY: InventoryState = {
  data: null,
  connection: "Connecting",
  stale: true,
  loading: true,
  error: null,
  lastUpdated: null,
};
export function watchInventory(
  client: SupabaseClient,
  onState: (state: InventoryState) => void,
  load: (signal?: AbortSignal) => Promise<InventorySnapshot> = getInventory,
) {
  let state: InventoryState = { ...INITIAL_INVENTORY };
  let stopped = false,
    connected = false,
    online = navigator.onLine !== false,
    running = false,
    dirty = false,
    epoch = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function publish(patch: Partial<InventoryState>) {
    if (stopped) return;
    state = { ...state, ...patch };
    onState(state);
  }
  async function drain() {
    running = true;
    while (dirty && !stopped) {
      dirty = false;
      const started = Date.now();
      const requestEpoch = epoch;
      controller = new AbortController();
      try {
        const data = await load(controller.signal);
        if (stopped) break;
        const fresh = online && connected && requestEpoch === epoch && !dirty;
        publish({
          data,
          loading: false,
          error: null,
          lastUpdated: new Date().toISOString(),
          stale: !fresh,
          connection: !online
            ? "Disconnected"
            : fresh
              ? "Live"
              : connected
                ? "Connecting"
                : state.connection,
        });
        clearTimeout(timer);
        timer = setTimeout(
          refresh,
          Math.max(1000, midnightDelay(data) - (Date.now() - started)),
        );
      } catch (failure) {
        if (!stopped)
          publish({
            loading: false,
            stale: true,
            connection: !online
              ? "Disconnected"
              : connected
                ? "Connecting"
                : state.connection,
            error:
              failure instanceof Error
                ? failure.message
                : "Unable to refresh inventory. Please retry.",
          });
      }
    }
    controller = null;
    running = false;
  }
  function refresh() {
    if (stopped) return;
    if (!online) {
      publish({
        stale: true,
        loading: false,
        connection: "Disconnected",
        error:
          "Network is offline. Inventory will refresh when the connection returns.",
      });
      return;
    }
    dirty = true;
    publish({
      stale: true,
      loading: state.data === null,
      connection: connected ? "Connecting" : state.connection,
    });
    if (!running) void drain();
  }
  function visibility() {
    if (document.visibilityState === "visible") refresh();
  }
  function offline() {
    online = false;
    epoch++;
    refresh();
  }
  function backOnline() {
    online = true;
    refresh();
  }
  const channel = client
    .channel("inventory-dashboard")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vehicles" },
      refresh,
    );
  refresh();
  channel.subscribe((status) => {
    if (stopped) return;
    epoch++;
    connected = status === "SUBSCRIBED";
    if (connected) refresh();
    else
      publish({
        stale: true,
        connection: status === "CLOSED" ? "Disconnected" : "Reconnecting",
      });
  });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", refresh);
  window.addEventListener("offline", offline);
  window.addEventListener("online", backOnline);
  return {
    refresh,
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", backOnline);
      void client.removeChannel(channel).catch(() => undefined);
    },
  };
}
