import { afterEach, expect, it, vi } from "vitest";
import {
  getBookingCatalog,
  listBookings,
  saveBooking,
  setBookingStatus,
} from "./booking-api";
import { createDemoBookings } from "./booking-test-fixtures";
import { bookingStarts } from "./booking-config";

const booking = { ...createDemoBookings("2030-01-02")[2], version: 1 };
const schedule = {
  timeZone: "Asia/Ho_Chi_Minh",
  hours: Array.from({ length: 7 }, (_, index) =>
    index < 5 ? { open: "09:00", close: "17:00" } : null,
  ),
};
afterEach(() => vi.unstubAllGlobals());
it("creates through the private proxy with zoned start and omitted automatic resources", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(booking)));
  vi.stubGlobal("fetch", fetcher);
  await saveBooking(
    { ...booking, technicianId: "auto", serviceBayId: "auto" },
    schedule,
  );
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("/booking-api/admin/bookings");
  expect(JSON.parse(init.body)).toEqual({
    name: booking.name,
    email: booking.email,
    phoneNumber: booking.phoneNumber,
    registrationNumber: booking.registrationNumber,
    serviceTypeId: booking.serviceTypeId,
    startsAt: "2030-01-02T04:00:00.000Z",
  });
  expect(new Headers(init.headers).has("Idempotency-Key")).toBe(false);
  expect(JSON.stringify(init.headers)).not.toContain("booking-admin-key");
});
it("warns staff to check saved bookings after an uncertain creation failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Response lost")));
  await expect(saveBooking(booking, schedule)).rejects.toThrow(
    "Check bookings before submitting again",
  );
});
it("sends the version and selected resources when rescheduling", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(booking)));
  vi.stubGlobal("fetch", fetcher);
  await saveBooking(booking, schedule, booking);
  expect(fetcher.mock.calls[0][0]).toBe(
    "/booking-api/admin/bookings/" + booking.id + "",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    startsAt: "2030-01-02T04:00:00.000Z",
    technicianId: "casey",
    serviceBayId: "bay-3",
    expectedVersion: 1,
  });
});
it("keeps backend conflict errors visible without a local fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Booking changed; refresh and retry" }),
          { status: 409 },
        ),
      ),
  );
  await expect(
    setBookingStatus(booking, "CANCELLED", "Changed plans"),
  ).rejects.toThrow("Booking changed; refresh and retry");
});
it("validates catalog and list responses rather than displaying malformed records", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({}))),
  );
  await expect(getBookingCatalog()).rejects.toThrow(/invalid/i);
  await expect(listBookings("2030-01-02")).rejects.toThrow(/invalid/i);
});
it("generates hourly starts using API opening hours and timezone", () => {
  const partial = {
    ...schedule,
    hours: Array(7).fill({ open: "09:10", close: "12:10" }),
  };
  expect(
    bookingStarts("2030-01-02", partial, new Date("2030-01-01T00:00Z")),
  ).toEqual(["10:00", "11:00"]);
  expect(
    bookingStarts("2030-01-02", schedule, new Date("2030-01-02T08:30Z")),
  ).toEqual(["16:00"]);
  expect(
    bookingStarts("2030-01-05", schedule, new Date("2030-01-01T00:00Z")),
  ).toEqual([]);
});

vi.mock("../auth/authenticated-fetch", () => ({
  authenticatedFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
