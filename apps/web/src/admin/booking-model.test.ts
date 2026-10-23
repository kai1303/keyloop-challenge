import { describe, expect, it } from "vitest";
import { createDemoBookings } from "./booking-test-fixtures";
import {
  filterBookings,
  shiftDate,
  endTime,
  formatDate,
} from "./booking-model";
describe("booking presentation", () => {
  it("filters by dealership date, contact/vehicle/id, technician and status", () => {
    const rows = createDemoBookings("2030-01-02");
    expect(rows).toHaveLength(5);
    expect(
      filterBookings(rows, {
        date: "2030-01-02",
        search: "EF-789",
        status: "all",
        technicianId: "all",
      }),
    ).toHaveLength(1);
    expect(
      filterBookings(rows, {
        date: "2030-01-02",
        search: "jamie@example.com",
        status: "CONFIRMED",
        technicianId: "casey",
      }),
    ).toHaveLength(1);
    expect(
      filterBookings(rows, {
        date: "2030-01-03",
        search: "",
        status: "all",
        technicianId: "all",
      }),
    ).toEqual([]);
  });

  it("formats calendar dates and legacy intervals", () => {
    expect(shiftDate("2030-01-31", 1)).toBe("2030-02-01");
    expect(endTime({ time: "09:45", durationMinutes: 105 })).toBe("11:30");
    expect(formatDate("2030-01-02")).toBe("Wed, 2 January 2030");
  });
});
