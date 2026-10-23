// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domAnimation, MotionConfig } from "motion/react";
import { BookingBoard } from "./BookingDashboard";
import {
  createDemoBookings,
  TEST_BOOKING_CATALOG,
} from "./booking-test-fixtures";

import { useState } from "react";
import { BookingConfigContext } from "./booking-config";
import type { Booking, BookingDraft, BookingStatus } from "./booking-model";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-02T01:00:00Z"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function Harness({ withFixtures }: { withFixtures: boolean }) {
  const [bookings, setBookings] = useState<Booking[]>(() =>
    withFixtures ? createDemoBookings() : [],
  );
  const [date, setDate] = useState("2030-01-02");
  const onSave = async (draft: BookingDraft, previous?: Booking) => {
    if (previous && draft.time === "10:00")
      throw new Error("The technician or bay is not available.");
    const booking: Booking = {
      ...draft,
      id: previous?.id ?? "BK-TEST",
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      registrationNumber: draft.registrationNumber.trim().toUpperCase(),
      technicianId:
        draft.technicianId === "auto" ? "avery" : draft.technicianId,
      serviceBayId:
        draft.serviceBayId === "auto" ? "bay-1" : draft.serviceBayId,
      durationMinutes: 60,
      status: "CONFIRMED",
      version: (previous?.version ?? 0) + 1,
    };
    setBookings((rows) => [
      ...rows.filter((row) => row.id !== booking.id),
      booking,
    ]);
    return booking;
  };
  const onStatus = async (
    booking: Booking,
    status: BookingStatus,
    cancellationReason?: string,
  ) => {
    const result = {
      ...booking,
      status,
      cancellationReason,
      version: booking.version + 1,
    };
    setBookings((rows) =>
      rows.map((row) => (row.id === result.id ? result : row)),
    );
    return result;
  };
  return (
    <BookingConfigContext.Provider value={TEST_BOOKING_CATALOG}>
      <BookingBoard
        bookings={bookings}
        date={date}
        setDate={setDate}
        onSave={onSave}
        onStatus={onStatus}
        refresh={async () => {}}
      />
    </BookingConfigContext.Provider>
  );
}
function setup(withFixtures = true) {
  render(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="always">
        <Harness withFixtures={withFixtures} />
      </MotionConfig>
    </LazyMotion>,
  );
  return userEvent.setup();
}
const details = () =>
  within(screen.getByRole("dialog", { name: "Booking details" }));
async function openBooking(
  user: ReturnType<typeof userEvent.setup>,
  id = "BK-1043",
) {
  await user.click(
    screen.getByRole("button", {
      name: new RegExp("(?:Select booking |View )" + id),
    }),
  );
}
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  value: string,
) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: value }));
}

describe("admin booking dashboard", () => {
  it("keeps the day grid and panel mounted while a new date loads", () => {
    const rows = createDemoBookings("2030-01-02");
    const board = (date: string, loading: boolean, bookings: Booking[]) => (
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="always">
          <BookingConfigContext.Provider value={TEST_BOOKING_CATALOG}>
            <BookingBoard
              date={date}
              loading={loading}
              bookings={bookings}
              setDate={() => {}}
              onSave={async () => rows[0]}
              onStatus={async () => rows[0]}
              refresh={async () => {}}
            />
          </BookingConfigContext.Provider>
        </MotionConfig>
      </LazyMotion>
    );
    const { rerender } = render(board("2030-01-02", false, rows));
    const panel = screen.getByRole("tabpanel");
    const grid = screen.getByRole("region", {
      name: "Daily schedule by service bay",
    });
    rerender(board("2030-01-03", true, []));
    expect(screen.getByRole("tabpanel")).toBe(panel);
    expect(
      screen.getByRole("region", { name: "Daily schedule by service bay" }),
    ).toBe(grid);
    expect(panel.getAttribute("aria-busy")).toBe("true");
    expect(panel.style.minHeight).toBe("596px");
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    expect(
      within(
        screen.getByRole("region", { name: "Selected day summary" }),
      ).getAllByText("—"),
    ).toHaveLength(3);
    rerender(board("2030-01-03", false, []));
    expect(screen.getByRole("tabpanel")).toBe(panel);
    expect(
      screen.getByRole("region", { name: "Daily schedule by service bay" }),
    ).toBe(grid);
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    expect(panel.style.minHeight).toBe("596px");
  });

  it("starts without sample bookings in day and list views", async () => {
    const user = setup(false);
    const header = screen
      .getByRole("heading", { name: "Booking management" })
      .closest("header")!;
    expect(
      within(header).queryByRole("button", { name: "New booking" }),
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: "New booking" })).toHaveLength(
      1,
    );
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    expect(screen.queryByText("Sample data")).toBeNull();
    expect(screen.queryByText("Alex Morgan")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /(?:Select booking |View )BK-/ }),
    ).toBeNull();
    expect(
      within(
        screen.getByRole("region", { name: "Selected day summary" }),
      ).getAllByText("0"),
    ).toHaveLength(3);
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    expect(screen.queryByRole("button", { name: /View BK-/ })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "New booking" })[0]);
    expect(screen.getByRole("dialog", { name: "New booking" })).toBeTruthy();
  });

  it("dismisses details on Escape or outside click and returns focus to the event", async () => {
    const user = setup();
    const trigger = screen.getByRole("button", {
      name: /Select booking BK-1043/,
    });
    await user.click(trigger);
    expect(details().getByText("BK-1043")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Booking details" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}");
    expect(details().getByText("BK-1043")).toBeTruthy();
    await user.click(
      screen.getByRole("heading", { name: "Booking management" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Booking details" }),
      ).toBeNull(),
    );
  });

  it("changes event selection without keeping stale details open", async () => {
    const user = setup();
    await openBooking(user);
    await openBooking(user, "BK-1044");
    expect(
      screen.getAllByRole("dialog", { name: "Booking details" }),
    ).toHaveLength(1);
    expect(details().getByText("BK-1044")).toBeTruthy();
    expect(details().queryByText("jamie@example.com")).toBeNull();
  });

  it("returns from the edit dialog to the booking popover", async () => {
    const user = setup();
    await openBooking(user);
    const trigger = details().getByRole("button", {
      name: "Reschedule / reassign",
    });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Reschedule / reassign" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reschedule / reassign" }),
      ).toBeNull(),
    );
    expect(details().getByText("BK-1043")).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });

  it("opens booking details in a popover from calendar and list triggers", async () => {
    const user = setup();
    expect(
      screen.getByRole("heading", { name: "Booking management" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "Booking details" }),
    ).toBeNull();
    expect(
      screen.queryByRole("complementary", { name: "Booking details" }),
    ).toBeNull();
    await openBooking(user);
    expect(details().getByText("jamie@example.com")).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(
      screen.getByRole("table", { name: "Bookings for selected day" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "View BK-1041" }));
    expect(details().getByText("BK-1041")).toBeTruthy();
  });

  it("searches contact / registration and shows explicit empty results", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Find a booking"), "EF-789");
    expect(
      screen.getAllByRole("button", { name: /(?:Select booking |View )BK-/ }),
    ).toHaveLength(1);
    await user.clear(screen.getByLabelText("Find a booking"));
    await choose(user, "Status", "Cancelled");
    expect(
      screen.getAllByRole("button", { name: /(?:Select booking |View )BK-/ }),
    ).toHaveLength(1);
    await choose(user, "Technician", "Casey");
    expect(screen.getByText("No bookings match your filters.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getAllByRole("button", { name: /(?:Select booking |View )BK-/ }),
    ).toHaveLength(5);
  });

  it("selects a schedule date with shadcn Calendar and restores focus", async () => {
    const user = setup();
    const trigger = screen.getByRole("button", { name: /^Schedule date:/ });
    await user.click(trigger);
    const picker = within(
      screen.getByRole("dialog", { name: "Choose schedule date" }),
    );
    expect(picker.getByRole("grid", { name: /January 2030/ })).toBeTruthy();
    await user.click(picker.getByRole("button", { name: /January 3rd, 2030/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Choose schedule date" }),
      ).toBeNull(),
    );
    expect(trigger.textContent).toContain("3 January 2030");
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "New booking" })[0]);
    expect(
      (
        within(
          screen.getByRole("dialog", { name: "New booking" }),
        ).getByLabelText("Date") as HTMLInputElement
      ).value,
    ).toBe("2030-01-03");
  });

  it("browses calendar months and permits viewing closed days", async () => {
    const user = setup();
    const trigger = screen.getByRole("button", { name: /^Schedule date:/ });
    await user.click(trigger);
    let picker = within(
      screen.getByRole("dialog", { name: "Choose schedule date" }),
    );
    await user.click(picker.getByRole("button", { name: /next month/i }));
    await user.click(
      picker.getByRole("button", { name: /February 2nd, 2030/ }),
    );
    expect(trigger.textContent).toContain("2 February 2030");
    expect(screen.getByText("Dealership closed")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Daily schedule by service bay" }),
    ).toBeTruthy();
    expect(screen.queryByText(/Choose an open weekday/)).toBeNull();
    expect(screen.queryByRole("button", { name: "New booking" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(trigger);
    picker = within(
      screen.getByRole("dialog", { name: "Choose schedule date" }),
    );
    expect(picker.getByRole("grid", { name: /January 2030/ })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.textContent).toContain("2 January 2030");
  });

  it("supports keyboard date selection in the dealership timezone", async () => {
    const user = setup();
    const trigger = screen.getByRole("button", { name: /^Schedule date:/ });
    await user.click(trigger);
    await user.keyboard("{ArrowRight}{Enter}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Choose schedule date" }),
      ).toBeNull(),
    );
    expect(trigger.textContent).toContain("3 January 2030");
  });

  it("navigates dates and returns to today", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(
      screen.getByRole("button", { name: /^Schedule date:/ }).textContent,
    ).toContain("3 January 2030");
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(
      screen.getByRole("button", { name: /^Schedule date:/ }).textContent,
    ).toContain("2 January 2030");
  });

  it("prefills a new booking with the selected future schedule date", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await user.click(screen.getAllByRole("button", { name: "New booking" })[0]);
    expect(
      (
        within(screen.getByRole("dialog")).getByLabelText(
          "Date",
        ) as HTMLInputElement
      ).value,
    ).toBe("2030-01-03");
  });

  it("keeps cancelled history outside occupied bay lanes", () => {
    const rows = createDemoBookings("2030-01-02");
    rows[4] = {
      ...rows[4],
      time: rows[2].time,
      serviceBayId: rows[2].serviceBayId,
    };
    render(
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="always">
          <BookingConfigContext.Provider value={TEST_BOOKING_CATALOG}>
            <BookingBoard
              bookings={rows}
              date="2030-01-02"
              setDate={() => {}}
              onSave={async () => rows[0]}
              onStatus={async () => rows[0]}
              refresh={async () => {}}
            />
          </BookingConfigContext.Provider>
        </MotionConfig>
      </LazyMotion>,
    );
    const lanes = within(
      screen.getByRole("region", { name: "Daily schedule by service bay" }),
    );
    expect(
      lanes.getByRole("button", { name: /Select booking BK-1043/ }),
    ).toBeTruthy();
    expect(lanes.queryByRole("button", { name: /BK-1045/ })).toBeNull();
    expect(
      within(
        screen.getByRole("region", { name: "Cancelled bookings" }),
      ).getByRole("button", { name: "View BK-1045" }),
    ).toBeTruthy();
  });

  it("opens a future booking from a historical empty date without crashing", async () => {
    const user = setup(false);
    for (let day = 0; day < 20; day++)
      await user.click(screen.getByRole("button", { name: "Previous day" }));
    await user.click(screen.getByRole("button", { name: "New booking" }));
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(
      "2030-01-02",
    );
  });

  it("creates a booking, assigns resources and updates both views", async () => {
    const user = setup(false);
    await user.click(screen.getByRole("button", { name: "New booking" }));
    const dialog = within(screen.getByRole("dialog", { name: "New booking" }));
    await user.type(dialog.getByLabelText("Full name"), "New Guest");
    await user.type(dialog.getByLabelText("Email"), "NEW@example.com");
    await user.type(dialog.getByLabelText("Phone number"), "+84901234567");
    await user.type(dialog.getByLabelText("Vehicle registration"), "xy-999");
    expect(dialog.queryByLabelText("Fixed duration")).toBeNull();
    await user.click(dialog.getByRole("combobox", { name: "Start time" }));
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
    ]);
    await user.click(screen.getByRole("option", { name: "15:00" }));
    expect((dialog.getByLabelText("End time") as HTMLInputElement).value).toBe(
      "16:00",
    );
    await user.click(dialog.getByRole("button", { name: "Create booking" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: /New booking|Reschedule \/ reassign|Cancel appointment\?/,
        }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /^Schedule date:/ }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: /Select booking .*New Guest/ }),
    );
    expect(details().getByText("new@example.com")).toBeTruthy();
    expect(details().getByText("XY-999")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/confirmed/);
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(
      within(screen.getByRole("table")).getByText("New Guest"),
    ).toBeTruthy();
  });

  it("retains an edit on conflict and allows a valid reschedule", async () => {
    const user = setup();
    await openBooking(user);
    await user.click(
      details().getByRole("button", { name: "Reschedule / reassign" }),
    );
    const dialog = within(
      screen.getByRole("dialog", { name: "Reschedule / reassign" }),
    );
    await choose(user, "Start time", "10:00");
    await choose(user, "Qualified technician", "Jordan");
    await choose(user, "Service bay", "Service bay 2");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringMatching(/not available/),
    );
    expect(
      dialog.getByRole("combobox", { name: "Start time" }).textContent,
    ).toBe("10:00");
    await choose(user, "Start time", "12:00");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: /New booking|Reschedule \/ reassign|Cancel appointment\?/,
        }),
      ).toBeNull(),
    );
    await openBooking(user);
    expect(details().getByText("12:00–13:00")).toBeTruthy();
    expect(details().getByText("Jordan")).toBeTruthy();
  });

  it("requires confirmation for cancellation and preserves the optional reason", async () => {
    const user = setup();
    await openBooking(user);
    await user.click(details().getByRole("button", { name: "Cancel booking" }));
    const dialog = within(
      screen.getByRole("dialog", { name: "Cancel appointment?" }),
    );
    await user.type(
      dialog.getByLabelText("Reason (optional)"),
      "Customer requested another day",
    );
    await user.click(
      dialog.getByRole("button", { name: "Confirm cancellation" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: /New booking|Reschedule \/ reassign|Cancel appointment\?/,
        }),
      ).toBeNull(),
    );
    await openBooking(user);
    expect(details().getByText("Cancelled")).toBeTruthy();
    expect(details().getByText("Customer requested another day")).toBeTruthy();
    expect(
      details().queryByRole("button", { name: "Reschedule / reassign" }),
    ).toBeNull();
  });

  it("starts and completes service through allowed status transitions", async () => {
    const user = setup();
    await openBooking(user);
    await user.click(details().getByRole("button", { name: "Start service" }));
    expect(await details().findByText("In service")).toBeTruthy();
    await user.click(
      details().getByRole("button", { name: "Complete service" }),
    );
    expect(await details().findByText("Completed")).toBeTruthy();
    expect(
      details().queryByRole("button", { name: "Start service" }),
    ).toBeNull();
  });

  it("supports Escape and restores focus to the opening control", async () => {
    const user = setup(false);
    const trigger = screen.getByRole("button", { name: "New booking" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: /New booking|Reschedule \/ reassign|Cancel appointment\?/,
        }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("shows the resource roster and opening hours", async () => {
    const user = setup();
    const tools = within(
      screen.getByRole("toolbar", { name: "Booking tools" }),
    );
    await user.click(tools.getByRole("button", { name: "Resources" }));
    expect(
      screen.getByRole("dialog", { name: "Service resources" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Opening hours" }));
    expect(
      screen.getByRole("dialog", { name: "Dealership opening hours" }),
    ).toBeTruthy();
    expect(screen.getByText("Saturday")).toBeTruthy();
  });
});
