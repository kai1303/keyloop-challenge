// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useInventory } from "./useInventory";
import {
  getInventory,
  getInventoryMetadata,
  inventoryRealtimeClient,
} from "./inventory-api";
import { DEFAULT_INVENTORY_QUERY, type InventoryPage } from "./inventory-query";
import { snapshot } from "./inventory-fixture";
vi.mock("./inventory-api", () => ({
  getInventory: vi.fn(),
  getInventoryMetadata: vi.fn(),
  inventoryRealtimeClient: vi.fn(),
}));
let client: QueryClient;
let status: (status: string) => void;
let changed: () => void;
const removeChannel = vi.fn().mockResolvedValue("ok");
const metadata = {
  summary: { total: 200, aging: 100, needsAction: 50 },
  options: { Toyota: ["Corolla"], BMW: ["X1"] },
};
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  vi.mocked(getInventory).mockReset().mockResolvedValue(snapshot);
  vi.mocked(getInventoryMetadata).mockReset().mockResolvedValue(metadata);
  removeChannel.mockClear();
  const channel = {
    on: vi.fn((_kind, _filter, callback) => {
      changed = callback;
      return channel;
    }),
    subscribe: vi.fn((callback) => {
      status = callback;
      return channel;
    }),
  };
  vi.mocked(inventoryRealtimeClient)
    .mockReset()
    .mockReturnValue({
      channel: () => channel,
      removeChannel,
    } as unknown as ReturnType<typeof inventoryRealtimeClient>);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
it("changes the server query without reconnecting or recalculating the global summary", async () => {
  const { result, rerender } = renderHook(({ query }) => useInventory(query), {
    initialProps: { query: DEFAULT_INVENTORY_QUERY },
    wrapper,
  });
  await waitFor(() => expect(result.current.data?.vehicles).toHaveLength(2));
  rerender({
    query: { ...DEFAULT_INVENTORY_QUERY, make: "Toyota", pageSize: 10 },
  });
  await waitFor(() =>
    expect(getInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ make: "Toyota", pageSize: 10 }),
      expect.any(AbortSignal),
    ),
  );
  expect(getInventoryMetadata).toHaveBeenCalledTimes(1);
  expect(inventoryRealtimeClient).toHaveBeenCalledTimes(1);
  expect(result.current.metadata?.summary.total).toBe(200);
});
it("retains existing rows and cancels a superseded request without allowing stale results to overwrite", async () => {
  let old!: (value: InventoryPage) => void;
  const { result, rerender } = renderHook(({ query }) => useInventory(query), {
    initialProps: { query: DEFAULT_INVENTORY_QUERY },
    wrapper,
  });
  await waitFor(() => expect(result.current.data).not.toBeNull());
  vi.mocked(getInventory).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      }),
  );
  rerender({ query: { ...DEFAULT_INVENTORY_QUERY, make: "Ford" } });
  await waitFor(() => expect(result.current.placeholder).toBe(true));
  expect(result.current.data?.vehicles).toHaveLength(2);
  const signal = vi.mocked(getInventory).mock.calls.at(-1)![1]!;
  vi.mocked(getInventory).mockResolvedValueOnce({ ...snapshot, vehicles: [] });
  rerender({ query: { ...DEFAULT_INVENTORY_QUERY, make: "BMW" } });
  await waitFor(() => expect(result.current.data?.vehicles).toHaveLength(0));
  expect(signal.aborted).toBe(true);
  await act(async () => old(snapshot));
  expect(result.current.data?.vehicles).toHaveLength(0);
});
it("refreshes the active page and global summary after subscription and coalesces change events", async () => {
  const { result, unmount } = renderHook(() => useInventory(), { wrapper });
  await waitFor(() => expect(result.current.metadata).not.toBeNull());
  act(() => status("SUBSCRIBED"));
  await waitFor(() => expect(getInventoryMetadata).toHaveBeenCalledTimes(2));
  const before = vi.mocked(getInventory).mock.calls.length;
  act(() => {
    for (let i = 0; i < 10; i++) changed();
  });
  await waitFor(() => expect(getInventory).toHaveBeenCalledTimes(before + 1));
  expect(result.current.connection).toBe("Live");
  unmount();
  expect(removeChannel).toHaveBeenCalledTimes(1);
});
it("retains stock while offline and refreshes when connectivity returns", async () => {
  const { result } = renderHook(() => useInventory(), { wrapper });
  act(() => status("SUBSCRIBED"));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  act(() => window.dispatchEvent(new Event("offline")));
  expect(result.current.connection).toBe("Disconnected");
  expect(result.current.data?.vehicles).toHaveLength(2);
  const before = vi.mocked(getInventory).mock.calls.length;
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() =>
    expect(vi.mocked(getInventory).mock.calls.length).toBeGreaterThan(before),
  );
  expect(result.current.connection).toBe("Live");
});
