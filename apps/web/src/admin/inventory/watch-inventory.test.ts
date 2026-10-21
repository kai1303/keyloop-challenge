// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { watchInventory, type InventoryState } from "./watch-inventory";
import { snapshot } from "./inventory-fixture";

let status: (value: string) => void;
let changed: () => void;
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(snapshot.serverTime));
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function setup(load = vi.fn().mockResolvedValue(snapshot)) {
  const states: InventoryState[] = [];
  const channel = {
    on: vi.fn((_kind: string, _filter: unknown, callback: () => void) => {
      changed = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (value: string) => void) => {
      status = callback;
      return channel;
    }),
  };
  const removeChannel = vi.fn().mockResolvedValue("ok");
  const client = {
    channel: () => channel,
    removeChannel,
  } as unknown as SupabaseClient;
  const watcher = watchInventory(client, (state) => states.push(state), load);
  stop = watcher.stop;
  return { states, load, channel, removeChannel, watcher };
}
it("loads initially and again after subscribing before claiming Live", async () => {
  const test = setup();
  await vi.waitFor(() => expect(test.states.at(-1)?.data).not.toBeNull());
  expect(test.states.at(-1)?.connection).toBe("Connecting");
  status("SUBSCRIBED");
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  expect(test.load).toHaveBeenCalledTimes(2);
  expect(test.channel.on).toHaveBeenCalledWith(
    "postgres_changes",
    { event: "*", schema: "public", table: "vehicles" },
    expect.any(Function),
  );
});
it("coalesces an event burst into one trailing authoritative fetch", async () => {
  let finish!: (value: typeof snapshot) => void;
  const load = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(snapshot);
  const test = setup(load);
  status("SUBSCRIBED");
  for (let index = 0; index < 10; index++) changed();
  expect(load).toHaveBeenCalledTimes(1);
  finish(snapshot);
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  expect(load).toHaveBeenCalledTimes(2);
});
it("marks old data stale on failures and refetches after reconnect", async () => {
  const test = setup();
  status("SUBSCRIBED");
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  status("CHANNEL_ERROR");
  expect(test.states.at(-1)).toMatchObject({
    stale: true,
    connection: "Reconnecting",
  });
  status("SUBSCRIBED");
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  test.load.mockRejectedValueOnce(new Error("Inventory refresh failed"));
  changed();
  await vi.waitFor(() =>
    expect(test.states.at(-1)?.error).toBe("Inventory refresh failed"),
  );
  expect(test.states.at(-1)?.data).not.toBeNull();
  expect(test.states.at(-1)?.stale).toBe(true);
  expect(test.states.at(-1)?.connection).not.toBe("Live");
});
it("marks offline data stale and refetches when the network returns", async () => {
  const test = setup();
  status("SUBSCRIBED");
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  window.dispatchEvent(new Event("offline"));
  expect(test.states.at(-1)).toMatchObject({
    stale: true,
    connection: "Disconnected",
  });
  const before = test.load.mock.calls.length;
  window.dispatchEvent(new Event("online"));
  await vi.waitFor(() =>
    expect(test.load.mock.calls.length).toBeGreaterThan(before),
  );
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
});

it("refreshes on visible/focus/midnight and cleans everything up", async () => {
  const test = setup();
  status("SUBSCRIBED");
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const before = test.load.mock.calls.length;
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() =>
    expect(test.load.mock.calls.length).toBeGreaterThan(before),
  );
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe("Live"));
  const midnightBefore = test.load.mock.calls.length;
  await vi.advanceTimersByTimeAsync(15 * 60 * 60 * 1000 + 100);
  expect(test.load.mock.calls.length).toBeGreaterThan(midnightBefore);
  test.watcher.stop();
  const stoppedCount = test.load.mock.calls.length;
  const stoppedStates = test.states.length;
  changed();
  status("SUBSCRIBED");
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(86400000);
  expect(test.load).toHaveBeenCalledTimes(stoppedCount);
  expect(test.states).toHaveLength(stoppedStates);
  expect(test.removeChannel).toHaveBeenCalledTimes(1);
});
