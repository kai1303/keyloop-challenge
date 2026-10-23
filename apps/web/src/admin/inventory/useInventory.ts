import { useCallback, useEffect, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getInventory,
  getInventoryMetadata,
  inventoryRealtimeClient,
} from "./inventory-api";
import { midnightDelay } from "./inventory-model";
import {
  DEFAULT_INVENTORY_QUERY,
  type InventoryQuery,
} from "./inventory-query";
import { INITIAL_INVENTORY, type InventoryState } from "./inventory-state";
export function useInventory(
  query: InventoryQuery = DEFAULT_INVENTORY_QUERY,
): InventoryState & { refresh: () => void } {
  const client = useQueryClient();
  const [connection, setConnection] =
    useState<InventoryState["connection"]>("Connecting");
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const page = useQuery({
    queryKey: ["inventory", "page", query],
    queryFn: ({ signal }) => getInventory(query, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const metadata = useQuery({
    queryKey: ["inventory", "metadata"],
    queryFn: ({ signal }) => getInventoryMetadata(signal),
    retry: false,
  });
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["inventory"] });
  }, [client]);
  useEffect(() => {
    let subscribed = false;
    let stopped = false,
      refreshing = false,
      dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function invalidate() {
      dirty = true;
      if (refreshing) return;
      refreshing = true;
      while (dirty && !stopped) {
        dirty = false;
        await client.invalidateQueries(
          { queryKey: ["inventory"] },
          { cancelRefetch: false },
        );
      }
      refreshing = false;
    }
    function changed() {
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          void invalidate();
        }, 150);
    }
    function offline() {
      setConnection("Disconnected");
    }
    function online() {
      setConnection(subscribed ? "Live" : "Connecting");
      void invalidate();
    }
    try {
      const realtime = inventoryRealtimeClient();
      const channel = realtime
        .channel("inventory")
        .on(
          "broadcast",
          { event: "inventory_changed" },
          changed,
        )
        .subscribe((status) => {
          if (stopped) return;
          subscribed = status === "SUBSCRIBED";
          setConnection(
            navigator.onLine === false
              ? "Disconnected"
              : status === "SUBSCRIBED"
                ? "Live"
                : status === "CLOSED"
                  ? "Disconnected"
                  : "Reconnecting",
          );
          if (status === "SUBSCRIBED") void invalidate();
        });
      window.addEventListener("offline", offline);
      window.addEventListener("online", online);
      return () => {
        stopped = true;
        clearTimeout(timer);
        window.removeEventListener("offline", offline);
        window.removeEventListener("online", online);
        void realtime.removeChannel(channel).catch(() => undefined);
      };
    } catch (error) {
      setConfigurationError(
        error instanceof Error
          ? error.message
          : "Unable to configure inventory",
      );
      setConnection("Disconnected");
    }
  }, [client]);
  useEffect(() => {
    if (!page.data) return;
    const timer = setTimeout(
      refresh,
      Math.max(
        1000,
        midnightDelay(page.data) - (Date.now() - page.dataUpdatedAt),
      ),
    );
    return () => clearTimeout(timer);
  }, [page.data, page.dataUpdatedAt, refresh]);
  const failure = page.error ?? metadata.error;
  return {
    ...INITIAL_INVENTORY,
    data: page.data ?? null,
    metadata: metadata.data ?? null,
    connection,
    loading: page.isPending && !page.error,
    updating: page.isFetching,
    placeholder: page.isPlaceholderData,
    stale: page.isFetching || page.isPlaceholderData || connection !== "Live",
    error:
      configurationError ?? (failure instanceof Error ? failure.message : null),
    lastUpdated: page.dataUpdatedAt
      ? new Date(page.dataUpdatedAt).toISOString()
      : null,
    refresh,
  };
}
