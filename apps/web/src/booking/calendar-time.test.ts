import { describe, expect, it } from "vitest";
import { monthDays, startTimes } from "./calendar-time";

const schedule = {
  timeZone: "Asia/Ho_Chi_Minh",
  hours: Array.from({ length: 7 }, (_, day) =>
    day < 5 ? { open: "09:00", close: "17:00" } : null,
  ),
};

describe("calendar dates and dealership times", () => {
  it("renders six complete Monday-first weeks across a month boundary", () => {
    const days = monthDays("2030-01", schedule.timeZone);
    expect(days).toHaveLength(42);
    expect(days[0].toISODate()).toBe("2029-12-31");
    expect(days[41].toISODate()).toBe("2030-02-10");
  });

  it("converts dealership-local starts to UTC and fits the full duration", () => {
    const slots = startTimes(
      "2030-01-02",
      60,
      schedule,
      "2030-01-01T00:00:00Z",
    );
    expect(slots[0]).toEqual({
      label: "09:00",
      value: "2030-01-02T02:00:00.000Z",
    });
    expect(slots.at(-1)?.label).toBe("16:00");
    expect(slots.map((slot) => slot.label)).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
    ]);
  });

  it("omits closed days and starts at or before the current time", () => {
    expect(
      startTimes("2030-01-05", 60, schedule, "2030-01-01T00:00:00Z"),
    ).toEqual([]);
    expect(
      startTimes("2030-01-02", 60, schedule, "2030-01-02T08:00:00Z").map(
        (slot) => slot.label,
      ),
    ).toEqual(["16:00"]);
    expect(
      startTimes("2030-01-02", 60, schedule, "2030-01-02T09:00:00Z"),
    ).toEqual([]);
  });

  it.each([0, -60, 30, 90, 600, 60.5, NaN])(
    "omits unsupported service duration %s",
    (duration) => {
      expect(
        startTimes("2030-01-02", duration, schedule, "2030-01-01T00:00:00Z"),
      ).toEqual([]);
    },
  );

  it("rounds opening up to a whole local hour and fits all 60 minutes before closing", () => {
    const partialHours = {
      ...schedule,
      hours: Array(7).fill({ open: "09:10", close: "12:30" }),
    };
    expect(
      startTimes("2030-01-02", 60, partialHours, "2030-01-01T00:00:00Z").map(
        (slot) => slot.label,
      ),
    ).toEqual(["10:00", "11:00"]);
    const shortHours = {
      ...schedule,
      hours: Array(7).fill({ open: "09:10", close: "10:30" }),
    };
    expect(
      startTimes("2030-01-02", 60, shortHours, "2030-01-01T00:00:00Z"),
    ).toEqual([]);
  });

  it("uses the dealership offset after a daylight-saving transition", () => {
    const ny = { ...schedule, timeZone: "America/New_York" };
    expect(
      startTimes("2030-03-11", 60, ny, "2030-01-01T00:00:00Z")[0]?.value,
    ).toBe("2030-03-11T13:00:00.000Z");
  });

  it("uses one canonical start per local hour across daylight-saving changes", () => {
    const ny = {
      timeZone: "America/New_York",
      hours: Array(7).fill({ open: "00:00", close: "05:00" }),
    };
    const spring = startTimes("2030-03-10", 60, ny, "2030-01-01T00:00:00Z");
    expect(spring.map((slot) => slot.label)).toEqual([
      "00:00",
      "01:00",
      "03:00",
      "04:00",
    ]);
    const fall = startTimes("2030-11-03", 60, ny, "2030-01-01T00:00:00Z");
    expect(fall.map((slot) => slot.label)).toEqual([
      "00:00",
      "01:00",
      "02:00",
      "03:00",
      "04:00",
    ]);
    expect(new Set(fall.map((slot) => slot.value)).size).toBe(5);
    expect(fall[1].value).toBe("2030-11-03T05:00:00.000Z");
  });

  it("omits a missing whole hour without drifting after a half-hour daylight-saving change", () => {
    const lordHowe = {
      timeZone: "Australia/Lord_Howe",
      hours: Array(7).fill({ open: "00:00", close: "05:00" }),
    };
    expect(
      startTimes("2030-10-06", 60, lordHowe, "2030-01-01T00:00:00Z").map(
        (slot) => slot.label,
      ),
    ).toEqual(["00:00", "01:00", "03:00", "04:00"]);
  });
});
