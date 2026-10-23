import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { watchAvailability } from "./watch-availability";

function fixture(dates: string | string[] = "2030-01-02", initialLoad = false) {
  const receivers = new Map<string, (message: { payload: unknown }) => void>();
  const statuses = new Map<string, (value: string) => void>();
  const channel = vi.fn((topic: string) => {
    const date = topic.replace("availability:", "");
    const value = {
      on: vi.fn(
        (
          _kind: string,
          _filter: unknown,
          callback: (message: { payload: unknown }) => void,
        ) => {
          receivers.set(date, callback);
          return value;
        },
      ),
      subscribe: vi.fn((callback: (value: string) => void) => {
        statuses.set(date, callback);
        return value;
      }),
    };
    return value;
  });
  const removeChannel = vi.fn().mockResolvedValue("ok");
  const client = { channel, removeChannel } as unknown as SupabaseClient;
  const refresh = vi.fn(async () => {});
  const onConnection = vi.fn();
  const onError = vi.fn();
  const target = new EventTarget();
  const stop = watchAvailability(
    client,
    dates,
    { refresh, onConnection, onError, initialLoad },
    target,
  );
  return {
    refresh,
    onConnection,
    onError,
    channel,
    removeChannel,
    target,
    stop,
    status: (value: string, date = "2030-01-02") => statuses.get(date)?.(value),
    receive: (payload: unknown, date = "2030-01-02") =>
      receivers.get(date)?.({ payload }),
  };
}

describe("watchAvailability", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("loads once after all initial subscriptions are ready, even when they connect apart", async () => {
    const f = fixture(["2030-01-02", "2030-01-03"], true);
    f.status("SUBSCRIBED", "2030-01-02");
    await vi.advanceTimersByTimeAsync(300);
    expect(f.refresh).not.toHaveBeenCalled();
    f.status("SUBSCRIBED", "2030-01-03");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.status("SUBSCRIBED", "2030-01-03");
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.stop();
  });

  it("loads after one second without Realtime and reconciles after a late connection", async () => {
    const f = fixture("2030-01-02", true);
    await vi.advanceTimersByTimeAsync(999);
    expect(f.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    f.stop();
  });

  it("cancels the initial fallback when disposed", async () => {
    const f = fixture("2030-01-02", true);
    f.stop();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it("coalesces multiple calendar dates and removes every subscription", async () => {
    const f = fixture(["2030-01-02", "2030-01-03"]);
    expect(f.channel.mock.calls.map(([topic]) => topic)).toEqual([
      "availability:2030-01-02",
      "availability:2030-01-03",
    ]);
    f.status("SUBSCRIBED", "2030-01-02");
    expect(f.onConnection).toHaveBeenLastCalledWith(false);
    f.status("SUBSCRIBED", "2030-01-03");
    expect(f.onConnection).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.receive({ date: "2030-01-02" });
    f.receive({ date: "2030-01-03" }, "2030-01-03");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    f.status("CHANNEL_ERROR", "2030-01-03");
    expect(f.onConnection).toHaveBeenLastCalledWith(false);
    f.status("SUBSCRIBED", "2030-01-03");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(3);
    f.stop();
    expect(f.removeChannel).toHaveBeenCalledTimes(2);
    f.receive({ date: "2030-01-03" }, "2030-01-03");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(3);
  });

  it("fetches a fresh snapshot after subscribing", async () => {
    const f = fixture();
    expect(f.refresh).not.toHaveBeenCalled();
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.onConnection).toHaveBeenLastCalledWith(true);
    f.stop();
  });

  it("coalesces date-only events and ignores other dates or row-shaped payloads", async () => {
    const f = fixture();
    f.receive({ date: "2030-01-03" });
    f.receive({ date: "2030-01-02", email: "private@example.com" });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).not.toHaveBeenCalled();
    for (let n = 0; n < 10; n++) f.receive({ date: "2030-01-02" });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.stop();
  });

  it("accepts the message UUID added by Supabase database Broadcast", async () => {
    const f = fixture();
    const id = "fade336a-52d2-4ab6-9e66-b2baac177f2e";
    f.receive({ date: "2030-01-02", id });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);

    f.receive({ date: "2030-01-02", id: "invalid" });
    f.receive({ date: "2030-01-02", id, email: "private@example.com" });
    f.receive({ date: "2030-01-03", id });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.stop();
  });

  it("refetches after reconnection and focus", async () => {
    const f = fixture();
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(200);
    f.status("CHANNEL_ERROR");
    expect(f.onConnection).toHaveBeenLastCalledWith(false);
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(200);
    f.target.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(3);
    f.stop();
  });

  it("cleans up pending work, focus listeners, and its channel", async () => {
    const f = fixture();
    f.receive({ date: "2030-01-02" });
    f.stop();
    f.target.dispatchEvent(new Event("focus"));
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("refreshes again if an event arrives while the HTTP request is in flight", async () => {
    const f = fixture();
    let resolve: () => void = () => {};
    f.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(200);
    f.receive({ date: "2030-01-02" });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    f.stop();
  });

  it("reports refresh errors and remains usable for a later refresh", async () => {
    const f = fixture();
    const error = new Error("network unavailable");
    f.refresh.mockRejectedValueOnce(error);
    f.status("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.onError).toHaveBeenCalledWith(error);
    f.target.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    f.stop();
  });
});
