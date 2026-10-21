import { useCallback, useEffect, useRef, useState } from "react";
import { inventoryRealtimeClient } from "./inventory-api";
import { INITIAL_INVENTORY, watchInventory } from "./watch-inventory";

export function useInventory() {
  const [state, setState] = useState(INITIAL_INVENTORY);
  const [attempt, setAttempt] = useState(0);
  const watcher = useRef<ReturnType<typeof watchInventory> | null>(null);
  useEffect(() => {
    try {
      const active = watchInventory(inventoryRealtimeClient(), setState);
      watcher.current = active;
      return () => {
        active.stop();
        if (watcher.current === active) watcher.current = null;
      };
    } catch (failure) {
      setState((current) => ({
        ...current,
        connection: "Disconnected",
        loading: false,
        stale: true,
        error:
          failure instanceof Error
            ? failure.message
            : "Unable to configure inventory",
      }));
    }
  }, [attempt]);
  const refresh = useCallback(() => {
    if (watcher.current) watcher.current.refresh();
    else setAttempt((value) => value + 1);
  }, []);
  return { ...state, refresh };
}
