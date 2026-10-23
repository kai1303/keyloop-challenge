import type { SupabaseClient } from "@supabase/supabase-js";

interface Callbacks {
  initialLoad?: boolean;
  refresh: () => Promise<void>;
  onConnection: (connected: boolean) => void;
  onError: (error: unknown) => void;
}

export function watchAvailability(
  client: SupabaseClient,
  dates: string | string[],
  callbacks: Callbacks,
  target: EventTarget = window,
): () => void {
  let disposed = false;
  let pending = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;

  async function run(): Promise<void> {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (disposed) return;
    if (initialTimer !== undefined) {
      clearTimeout(initialTimer);
      initialTimer = undefined;
    }
    if (pending) {
      dirty = true;
      return;
    }
    pending = true;
    try {
      await callbacks.refresh();
    } catch (error) {
      if (!disposed) callbacks.onError(error);
    } finally {
      pending = false;
      if (dirty && !disposed) {
        dirty = false;
        queue();
      }
    }
  }

  function queue(): void {
    if (!disposed && timer === undefined) {
      timer = setTimeout(() => {
        void run();
      }, 200);
    }
  }

  const watchedDates =
    typeof dates === "string" ? [dates] : [...new Set(dates)];
  const connected = new Set<string>();
  const channels = watchedDates.map((date) =>
    client
      .channel("availability:" + date, { config: { private: false } })
      .on("broadcast", { event: "availability_changed" }, ({ payload }) => {
        if (
          payload &&
          typeof payload === "object" &&
          payload.date === date &&
          Object.keys(payload).every((key) => key === "date" || key === "id") &&
          (payload.id === undefined ||
            (typeof payload.id === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                payload.id,
              )))
        )
          queue();
      })
      .subscribe((status) => {
        if (disposed) return;
        const wasConnected = connected.has(date);
        if (status === "SUBSCRIBED") connected.add(date);
        else connected.delete(date);
        callbacks.onConnection(connected.size === watchedDates.length);
        if (
          status === "SUBSCRIBED" &&
          !wasConnected &&
          connected.size === watchedDates.length
        )
          queue();
      }),
  );

  // Calendar/form reads follow subscription readiness; the monitor already has a snapshot.
  if (callbacks.initialLoad)
    initialTimer = setTimeout(() => {
      void run();
    }, 1000);

  target.addEventListener("focus", queue);
  return () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    if (initialTimer !== undefined) clearTimeout(initialTimer);
    target.removeEventListener("focus", queue);
    for (const channel of channels) {
      void client.removeChannel(channel).catch((error) => {
        console.warn("Realtime channel cleanup failed", error);
      });
    }
  };
}
