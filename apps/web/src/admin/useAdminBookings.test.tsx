// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAdminBookings } from "./useAdminBookings";
import { createDemoBookings } from "./booking-test-fixtures";
const mocks = vi.hoisted(() => ({
  getBookingCatalog: vi.fn(),
  listBookings: vi.fn(),
  saveBooking: vi.fn(),
  setBookingStatus: vi.fn(),
  bookingRealtimeClient: vi.fn(),
  watchBookings: vi.fn(),
}));
vi.mock("./booking-api", () => mocks);
vi.mock("./watch-bookings", () => ({ watchBookings: mocks.watchBookings }));
const row = createDemoBookings("2030-01-02")[2];
let callbacks: {
  refresh: () => Promise<void>;
  onConnection: (value: boolean) => void;
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-02T01:00Z"));
  mocks.getBookingCatalog.mockResolvedValue({
    services: [{ id: "inspection", name: "Inspection", durationMinutes: 60 }],
    technicians: [],
    bays: [],
    schedule: {
      timeZone: "UTC",
      hours: Array(7).fill({ open: "09:00", close: "17:00" }),
    },
  });
  mocks.listBookings.mockResolvedValue([]);
  mocks.bookingRealtimeClient.mockReturnValue({});
  mocks.watchBookings.mockImplementation((_client, _date, value) => {
    callbacks = value;
    return vi.fn();
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useAdminBookings(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
it("loads persisted bookings and reloads them after a date broadcast", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.bookings).toEqual([]);
  mocks.listBookings.mockResolvedValue([row]);
  await act(async () => {
    await callbacks.refresh();
  });
  await waitFor(() => expect(result.current.bookings).toEqual([row]));
  expect(mocks.listBookings).toHaveBeenCalledWith(
    "2030-01-02",
    expect.anything(),
  );
});
it("waits for server confirmation and refetches after creation", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.saveBooking.mockResolvedValue(row);
  mocks.listBookings.mockResolvedValue([row]);
  await act(async () => {
    await result.current.save(row);
  });
  expect(mocks.saveBooking).toHaveBeenCalledWith(
    row,
    expect.objectContaining({ timeZone: "UTC" }),
    undefined,
  );
  expect(result.current.bookings).toEqual([row]);
});
it("reports storage failures without a local booking fallback", async () => {
  mocks.listBookings.mockRejectedValue(new Error("Storage offline"));
  const { result } = setup();
  await waitFor(() => expect(result.current.error).toBe("Storage offline"));
  expect(result.current.bookings).toEqual([]);
});
it("retains backend conflict errors and never fabricates a booking", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.saveBooking.mockRejectedValue(new Error("No resources available"));
  await act(async () => {
    await expect(result.current.save(row)).rejects.toThrow(
      "No resources available",
    );
  });
  expect(result.current.bookings).toEqual([]);
});

it("surfaces a failed creation without retaining a retry key", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.saveBooking.mockRejectedValue(new Error("Response lost"));
  await act(async () => {
    await expect(result.current.save(row)).rejects.toThrow("Response lost");
  });
  expect(mocks.saveBooking).toHaveBeenCalledTimes(1);
  expect(mocks.saveBooking.mock.calls[0]).toHaveLength(3);
  expect(result.current.bookings).toEqual([]);
});
