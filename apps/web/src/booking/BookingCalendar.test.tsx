// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { domAnimation, LazyMotion } from "motion/react";
import { BookingCalendar } from "./BookingCalendar";
import { startTimes } from "./calendar-time";
import * as realtime from "./public-realtime";
import type { SupabaseClient } from "@supabase/supabase-js";

const oil = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Oil change",
  durationMinutes: 60,
};
const inspection = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Inspection",
  durationMinutes: 60,
};
const schedule = {
  timeZone: "UTC",
  hours: Array.from({ length: 7 }, (_, day) =>
    day < 5 ? { open: "09:00", close: "17:00" } : null,
  ),
};
const fetchMock = vi.fn();
let unavailableStarts = new Set<string>();
let appointments: { startsAt: string; endsAt: string; serviceName: string }[] =
  [];
const bookingsSnapshot = () => ({
  month: "2030-01",
  technicians: [
    { id: "technician-0", name: "Technician A", serviceTypeIds: [oil.id] },
    {
      id: "technician-1",
      name: "Technician B",
      serviceTypeIds: [inspection.id],
    },
  ],
  bays: [
    { id: "bay-0", name: "Bay 1" },
    { id: "bay-1", name: "Bay 2" },
  ],
  bookings: [
    ...appointments.map((item) => ({
      ...item,
      technicianId: "technician-0",
      bayId: "bay-0",
    })),
    ...[...unavailableStarts].map((startsAt) => ({
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 60 * 60000).toISOString(),
      serviceName: oil.name,
      technicianId: "technician-0",
      bayId: "bay-0",
    })),
  ],
});
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubEnv("VITE_BOOKINGS_SUPABASE_URL", "");
  vi.stubEnv("VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY", "");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-02T08:00:00Z"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  appointments = [];
  unavailableStarts = new Set();
  fetchMock.mockReset().mockImplementation((url: string) => {
    if (url === "/api/service-types") return reply([oil, inspection]);
    if (url === "/api/schedule") return reply(schedule);
    if (url.startsWith("/api/bookings?"))
      return reply({
        bookings: appointments,
        month: new URL(url, "http://localhost").searchParams.get("month"),
      });
    if (url.startsWith("/api/availability?")) {
      const query = new URL(url, "http://localhost").searchParams;
      const start = Date.parse(query.get("startsAt")!);
      const data = bookingsSnapshot();
      const busy = data.bookings.filter(
        (b) =>
          Date.parse(b.startsAt) < start + 3600000 &&
          Date.parse(b.endsAt) > start,
      );
      const technicians = data.technicians.filter(
        (t) =>
          t.serviceTypeIds.includes(query.get("serviceTypeId")!) &&
          !busy.some((b) => b.technicianId === t.id),
      );
      const bays = data.bays.filter((t) => !busy.some((b) => b.bayId === t.id));
      return reply({
        technicians,
        bays,
        available: technicians.length > 0 && bays.length > 0,
      });
    }
    if (url === "/api/bookings")
      return reply(
        {
          id: "booking-1",
          status: "CONFIRMED",
          service: oil,
          startsAt: "2030-01-03T09:00:00.000Z",
          endsAt: "2030-01-03T10:00:00.000Z",
        },
        201,
      );
    throw new Error("Unexpected URL " + url);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openDay() {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation} strict>
      <BookingCalendar />
    </LazyMotion>,
  );
  await user.click(
    await screen.findByRole("button", {
      name: "Book Thursday, January 3, 2030",
    }),
  );
  return user;
}

async function selectResources(
  user: ReturnType<typeof userEvent.setup>,
  technician = "Technician A",
  bay = "Bay 1",
) {
  await waitFor(() =>
    expect(
      (
        screen.getByRole("combobox", {
          name: "Available technician",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  screen.getByRole("combobox", { name: "Available technician" }).focus();
  await user.keyboard("{ArrowDown}");
  await user.click(await screen.findByRole("option", { name: technician }));
  screen.getByRole("combobox", { name: "Available bay" }).focus();
  await user.keyboard("{ArrowDown}");
  await user.click(await screen.findByRole("option", { name: bay }));
}

describe("guest booking calendar", () => {
  it("requires a free technician and bay after selecting a time, with no automatic option", async () => {
    const user = await openDay();
    const confirm = screen.getByRole("button", {
      name: "Confirm appointment",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    screen.getByRole("combobox", { name: "Available technician" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      await screen.findByRole("option", { name: "Technician A" }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Technician B" })).toBeNull();
    expect(screen.queryByRole("option", { name: /automatically/i })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Technician A" }));
    expect(confirm.disabled).toBe(true);
    screen.getByRole("combobox", { name: "Available bay" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "Bay 2" }));
    expect(confirm.disabled).toBe(false);
    screen.getByRole("combobox", { name: "Start time" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "10:00" }));
    expect(
      screen.getByRole("combobox", { name: "Available technician" })
        .textContent,
    ).toContain("Select a technician");
    expect(
      screen.getByRole("combobox", { name: "Available bay" }).textContent,
    ).toContain("Select a bay");
    expect(confirm.disabled).toBe(true);
  });

  it("clears a resource lost during refresh while other resources remain free", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, options: unknown) => {
      const response = await original(url, options);
      if (!url.startsWith("/api/availability?")) return response;
      const body = await response.json();
      body.technicians.push({ id: "technician-2", name: "Technician C" });
      body.available = body.bays.length > 0;
      return reply(body);
    });
    const user = await openDay();
    await selectResources(user);
    unavailableStarts.add("2030-01-03T09:00:00.000Z");
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Available technician" })
          .textContent,
      ).toContain("Select a technician"),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Available technician",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    screen.getByRole("combobox", { name: "Available technician" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      await screen.findByRole("option", { name: "Technician C" }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Technician A" })).toBeNull();
  });

  it("fetches selected-time resources once after subscription and refreshes them on invalidation", async () => {
    const statuses: ((status: string) => void)[] = [];
    const changed: ((event: { payload: { date: string } }) => void)[] = [];
    const channel = (topic: string) => {
      const value = {
        on: (
          _kind: string,
          _filter: unknown,
          callback: (event: { payload: { date: string } }) => void,
        ) => {
          if (topic === "availability:2030-01-03") changed.push(callback);
          return value;
        },
        subscribe: (callback: (status: string) => void) => {
          statuses.push(callback);
          return value;
        },
      };
      return value;
    };
    vi.spyOn(realtime, "publicRealtimeClient").mockReturnValue({
      channel,
      removeChannel: async () => "ok",
    } as unknown as SupabaseClient);
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    await waitFor(() => expect(statuses).toHaveLength(31));
    const requests = (path: string) =>
      fetchMock.mock.calls.filter(([url]) => url.startsWith(path));
    expect(requests("/api/bookings?")).toHaveLength(0);
    act(() => statuses.forEach((status) => status("SUBSCRIBED")));
    await waitFor(() => expect(requests("/api/bookings?")).toHaveLength(1));
    await user.click(
      screen.getByRole("button", { name: "Book Thursday, January 3, 2030" }),
    );
    await waitFor(() => expect(statuses).toHaveLength(32));
    act(() => statuses[31]("SUBSCRIBED"));
    await screen.findByText("Available at last check");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(requests("/api/bookings?")).toHaveLength(1);
    expect(requests("/api/availability?")).toHaveLength(1);
    unavailableStarts.add("2030-01-03T09:00:00.000Z");
    act(() =>
      changed.forEach((callback) =>
        callback({ payload: { date: "2030-01-03" } }),
      ),
    );
    await screen.findByText("This time is fully booked. Choose another time.");
    expect(requests("/api/bookings?")).toHaveLength(2);
    expect(statuses).toHaveLength(32);
    expect(requests("/api/availability?")).toHaveLength(2);
    screen.getByRole("combobox", { name: "Service" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "Inspection" }));
    await waitFor(() => expect(statuses).toHaveLength(33));
    act(() => statuses[32]("SUBSCRIBED"));
    await screen.findByText("Available at last check");
    expect(requests("/api/bookings?")).toHaveLength(2);
    expect(requests("/api/availability?")).toHaveLength(3);
  });

  it("stacks simultaneous appointments and expands a busy date while retaining booking access", async () => {
    appointments = [
      {
        startsAt: "2030-01-03T09:00:00Z",
        endsAt: "2030-01-03T10:00:00Z",
        serviceName: "Inspection",
      },
      {
        startsAt: "2030-01-03T09:00:00Z",
        endsAt: "2030-01-03T09:30:00Z",
        serviceName: "Oil change",
      },
      {
        startsAt: "2030-01-03T10:30:00Z",
        endsAt: "2030-01-03T11:00:00Z",
        serviceName: "Oil change",
      },
      {
        startsAt: "2030-01-03T14:00:00Z",
        endsAt: "2030-01-03T15:00:00Z",
        serviceName: "Inspection",
      },
    ];
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    const list = await screen.findByRole("list", {
      name: "Appointments for Thursday, January 3, 2030",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getAllByText("09:00")).toHaveLength(2);
    expect(within(list).getByText("10:30")).toBeTruthy();
    expect(within(list).queryByText("14:00")).toBeNull();
    const more = screen.getByRole("button", {
      name: "Show 1 more appointment for January 3",
    });
    await user.click(more);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getByText("14:00")).toBeTruthy();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await user.click(
      screen.getByRole("button", { name: "Book Thursday, January 3, 2030" }),
    );
    expect(screen.getByRole("dialog", { name: "Book a service" })).toBeTruthy();
  });

  it("places appointments on their dealership-local date, including past dates", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) =>
      url === "/api/schedule"
        ? reply({ ...schedule, timeZone: "Asia/Ho_Chi_Minh" })
        : original(url, options),
    );
    appointments = [
      {
        startsAt: "2030-01-01T23:30:00Z",
        endsAt: "2030-01-02T00:00:00Z",
        serviceName: "Oil change",
      },
    ];
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    const list = await screen.findByRole("list", {
      name: "Appointments for Wednesday, January 2, 2030",
    });
    expect(within(list).getByText("06:30")).toBeTruthy();
    expect(within(list).queryByText("23:30")).toBeNull();
  });

  it("refreshes calendar entries on focus", async () => {
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === "/api/bookings?month=2030-01",
        ),
      ).toBe(true),
    );
    appointments = [
      {
        startsAt: "2030-01-03T11:00:00Z",
        endsAt: "2030-01-03T11:30:00Z",
        serviceName: "Oil change",
      },
    ];
    fireEvent(window, new Event("focus"));
    expect(
      await screen.findByRole("list", {
        name: "Appointments for Thursday, January 3, 2030",
      }),
    ).toBeTruthy();
  });

  it("shows a retryable list error without blocking a new appointment", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) =>
      url.startsWith("/api/bookings?")
        ? reply({ message: "Appointments could not be loaded" }, 503)
        : original(url, options),
    );
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    expect(
      await screen.findByText("Appointments could not be loaded"),
    ).toBeTruthy();
    fetchMock.mockImplementation(original);
    await user.click(
      screen.getByRole("button", { name: "Retry appointments" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Appointments could not be loaded")).toBeNull(),
    );
    await user.click(
      screen.getByRole("button", { name: "Book Thursday, January 3, 2030" }),
    );
    expect(screen.getByRole("dialog", { name: "Book a service" })).toBeTruthy();
  });

  it("ignores an earlier month response after navigating", async () => {
    const original = fetchMock.getMockImplementation()!;
    let resolveJanuary: (response: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, options: unknown) =>
      url === "/api/bookings?month=2030-01"
        ? new Promise<Response>((resolve) => {
            resolveJanuary = resolve;
          })
        : original(url, options),
    );
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === "/api/bookings?month=2030-01",
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === "/api/bookings?month=2030-02",
        ),
      ).toBe(true),
    );
    await act(async () => {
      resolveJanuary(
        new Response(
          JSON.stringify([
            {
              startsAt: "2030-02-01T10:00:00Z",
              endsAt: "2030-02-01T10:30:00Z",
              serviceName: "Stale service",
            },
          ]),
        ),
      );
    });
    expect(screen.queryByText("Stale service")).toBeNull();
    expect(screen.getByRole("heading", { name: "February 2030" })).toBeTruthy();
  });

  it("queries the selected time instead of prefetching every start", async () => {
    unavailableStarts.add("2030-01-03T09:00:00.000Z");
    const user = await openDay();
    await screen.findByText("This time is fully booked. Choose another time.");
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const calls = () =>
      fetchMock.mock.calls.filter(([url]) =>
        url.startsWith("/api/availability?"),
      );
    expect(calls()).toHaveLength(1);
    expect(calls()[0][0]).toContain(
      encodeURIComponent("2030-01-03T09:00:00.000Z"),
    );
    screen.getByRole("combobox", { name: "Start time" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
    ]);
    await user.click(screen.getByRole("option", { name: "11:00" }));
    await screen.findByText("Available at last check");
    expect(calls()).toHaveLength(2);
    expect(calls()[1][0]).toContain(
      encodeURIComponent("2030-01-03T11:00:00.000Z"),
    );
  });

  it("queries resources again when a different service is selected", async () => {
    unavailableStarts.add("2030-01-03T09:00:00.000Z");
    const user = await openDay();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Start time" }).textContent,
      ).toContain("09:00"),
    );
    screen.getByRole("combobox", { name: "Service" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "Inspection" }));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Start time" }).textContent,
      ).toContain("09:00"),
    );
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
      "10:00",
    );
    screen.getByRole("combobox", { name: "Start time" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      (await screen.findByRole("option", { name: "09:00" })).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
  });

  it("requires an explicit replacement when the selected time expires", async () => {
    const user = await openDay();
    await screen.findByText("Available at last check");
    await user.type(screen.getByLabelText("Full name"), "Still deciding");
    vi.setSystemTime(new Date("2030-01-03T09:01:00Z"));
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Start time" }).textContent,
      ).toContain("Select a time"),
    );
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
      "Still deciding",
    );
    screen.getByRole("combobox", { name: "Start time" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "10:00" }));
    await selectResources(user);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps an existing choice visible when live refresh marks it fully booked", async () => {
    const user = await openDay();
    await screen.findByText("Available at last check");
    unavailableStarts.add("2030-01-03T09:00:00.000Z");
    fireEvent(window, new Event("focus"));
    expect(
      await screen.findByText(
        "This time is fully booked. Choose another time.",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
      "10:00",
    );
    screen.getByRole("combobox", { name: "Start time" }).focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    expect(
      screen
        .getByRole("option", { name: "09:00" })
        .getAttribute("aria-disabled"),
    ).toBeNull();
    await user.click(screen.getByRole("option", { name: "10:00" }));
    await selectResources(user);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps confirmation disabled when the selected time has no free qualified resources", async () => {
    unavailableStarts = new Set(
      startTimes("2030-01-03", 60, schedule).map((s) => s.value),
    );
    await openDay();
    await screen.findByText("This time is fully booked. Choose another time.");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Available technician",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("fails closed while times cannot be checked and retries without losing guest details", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) =>
      url.startsWith("/api/availability?")
        ? reply({ message: "Unable to check times" }, 503)
        : original(url, options),
    );
    const user = await openDay();
    expect(
      (await screen.findAllByText("Unable to check times")).length,
    ).toBeGreaterThan(0);
    expect(
      (
        screen.getByRole("combobox", {
          name: "Available technician",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText("Full name"), "Retained guest");
    fetchMock.mockImplementation(original);
    await user.click(screen.getByRole("button", { name: "Retry times" }));
    await screen.findByText("Available at last check");
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
      "Retained guest",
    );
  });

  it("calculates a read-only end time when the start time or service changes", async () => {
    const user = await openDay();
    const end = screen.getByLabelText("End time") as HTMLInputElement;
    expect(end.value).toBe("10:00");
    expect(end.readOnly).toBe(true);
    expect(end.name).toBe("");

    screen.getByRole("combobox", { name: "Start time" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "10:00" }));
    expect(end.value).toBe("11:00");

    screen.getByRole("combobox", { name: "Service" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "Inspection" }));
    await waitFor(() => expect(end.value).toBe("10:00"));
  });

  it("leaves the calculated end blank when no start times remain", async () => {
    vi.setSystemTime(new Date("2030-01-03T16:50:00Z"));
    await openDay();
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows only the selected month's dates and opens a date after month navigation", async () => {
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation} strict>
        <BookingCalendar />
      </LazyMotion>,
    );
    await screen.findByRole("button", {
      name: "Book Thursday, January 3, 2030",
    });
    expect(
      screen.getAllByRole("button", { name: /January \d+, 2030/ }),
    ).toHaveLength(31);
    expect(screen.queryByRole("button", { name: /December 31, 2029/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /February 1, 2030/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "February 2030" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /February \d+, 2030/ }),
    ).toHaveLength(28);
    expect(screen.queryByRole("button", { name: /January 31, 2030/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /March 1, 2030/ })).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Book Friday, February 1, 2030",
      }),
    );
    expect(screen.getByText("Friday, 1 February 2030")).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => {
          if (!url.startsWith("/api/availability?")) return false;
          return new URLSearchParams(url.split("?")[1])
            .get("startsAt")
            ?.startsWith("2030-02-01T09:00:");
        }),
      ).toBe(true),
    );
  });

  it("disables closed and past dates, and navigates months", async () => {
    const user = await openDay();
    expect(screen.getByRole("dialog", { name: "Book a service" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Book Thursday, January 3, 2030",
      ),
    );
    expect(
      (
        screen.getByRole("button", {
          name: /Tuesday, January 1, 2030/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /Saturday, January 5, 2030/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "February 2030" })).toBeTruthy();
  });

  it("books the selected date with contact and vehicle details", async () => {
    const original = fetchMock.getMockImplementation()!;
    let completeBooking: () => Promise<void> = async () => {};
    fetchMock.mockImplementation((url: string, options: unknown) =>
      url === "/api/bookings"
        ? new Promise<Response>((resolve) => {
            completeBooking = async () => {
              resolve(await original(url, options));
            };
          })
        : original(url, options),
    );
    const user = await openDay();
    await selectResources(user);
    await user.type(screen.getByLabelText("Full name"), "Guest Example");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Phone number"), "+84901234567");
    await user.type(screen.getByLabelText("Vehicle registration"), "AB-123");
    await user.click(
      screen.getByRole("button", { name: "Confirm appointment" }),
    );
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeTruthy();
    expect(screen.queryByText("Create Booking Success")).toBeNull();
    await act(async () => {
      await completeBooking();
    });
    expect(
      await screen.findByRole("heading", { name: "Appointment confirmed" }),
    ).toBeTruthy();
    expect(screen.queryByText("Create Booking Success")).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Appointment confirmed" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Book a service" }),
    ).toBeNull();
    expect(screen.getByText("Service")).toBeTruthy();
    expect(screen.getByText("Date")).toBeTruthy();
    expect(screen.getByText("Time")).toBeTruthy();
    expect(screen.getByText("Time zone")).toBeTruthy();
    expect(screen.getByText("Thursday, 3 January 2030")).toBeTruthy();
    expect(screen.getByText("09:00 – 10:00")).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === "/api/bookings?month=2030-01",
        ).length,
      ).toBeGreaterThan(1),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/bookings");
    expect(JSON.parse(call?.[1].body)).toMatchObject({
      name: "Guest Example",
      email: "guest@example.com",
      phoneNumber: "+84901234567",
      registrationNumber: "AB-123",
      serviceTypeId: oil.id,
      startsAt: "2030-01-03T09:00:00.000Z",
      technicianId: "technician-0",
      serviceBayId: "bay-0",
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/availability?"),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Book Thursday, January 3, 2030",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Book Friday, January 4, 2030" }),
    );
    expect(screen.getByRole("dialog", { name: "Book a service" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Appointment confirmed" }),
    ).toBeNull();
  });

  it("reuses the creation key after a lost response without rechecking occupied availability", async () => {
    const user = await openDay();
    await selectResources(user);
    const original = fetchMock.getMockImplementation()!;
    let posts = 0;
    fetchMock.mockImplementation((url: string, options: unknown) => {
      if (url === "/api/bookings" && ++posts === 1)
        return Promise.reject(new TypeError("Response lost"));
      return original(url, options);
    });
    await user.type(screen.getByLabelText("Full name"), "Guest Example");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Phone number"), "+84901234567");
    await user.type(screen.getByLabelText("Vehicle registration"), "AB-123");
    await user.click(
      screen.getByRole("button", { name: "Confirm appointment" }),
    );
    await screen.findByText("Response lost");
    unavailableStarts.add("2030-01-03T09:00:00.000Z");
    fireEvent(window, new Event("focus"));
    await screen.findByText("This time is fully booked. Choose another time.");
    expect(
      screen.getByRole("combobox", { name: "Available technician" })
        .textContent,
    ).toContain("Technician A");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm appointment",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );

    await user.click(
      screen.getByRole("button", { name: "Confirm appointment" }),
    );
    await screen.findByRole("heading", { name: "Appointment confirmed" });
    const requests = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/bookings",
    );
    expect(requests).toHaveLength(2);
    const keys = requests.map(([, init]) =>
      new Headers(init.headers).get("Idempotency-Key"),
    );
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("recovers a committed booking after its start has passed and availability refreshes", async () => {
    vi.setSystemTime(new Date("2030-01-03T08:59:59Z"));
    const user = await openDay();
    await selectResources(user);
    const original = fetchMock.getMockImplementation()!;
    let posts = 0;
    fetchMock.mockImplementation((url: string, options: unknown) => {
      if (url === "/api/bookings" && ++posts === 1) {
        vi.setSystemTime(new Date("2030-01-03T09:00:01Z"));
        return Promise.reject(new TypeError("Response lost after start"));
      }
      return original(url, options);
    });
    await user.type(screen.getByLabelText("Full name"), "Guest Example");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Phone number"), "+84901234567");
    await user.type(screen.getByLabelText("Vehicle registration"), "AB-123");
    await user.click(
      screen.getByRole("button", { name: "Confirm appointment" }),
    );
    await screen.findByText("Response lost after start");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/bookings?"))
          .length,
      ).toBeGreaterThan(1),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm appointment" }),
    );
    await screen.findByRole("heading", { name: "Appointment confirmed" });
    const requests = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/bookings",
    );
    expect(requests).toHaveLength(2);
    expect(requests[1][1].body).toBe(requests[0][1].body);
    expect(new Headers(requests[1][1].headers).get("Idempotency-Key")).toBe(
      new Headers(requests[0][1].headers).get("Idempotency-Key"),
    );
  });

  it("keeps the form and shows a conflict if confirmation loses the slot", async () => {
    const user = await openDay();
    await selectResources(user);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) =>
      url === "/api/bookings"
        ? reply(
            { message: "That time was just booked. Choose another time." },
            409,
          )
        : original(url, options),
    );
    await user.type(screen.getByLabelText("Full name"), "Guest Example");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Phone number"), "+84901234567");
    await user.type(screen.getByLabelText("Vehicle registration"), "AB-123");
    await user.click(
      screen.getByRole("button", { name: "Confirm appointment" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That time was just booked. Choose another time.",
    );
    expect(screen.queryByText("Appointment confirmed")).toBeNull();
    expect(screen.queryByText("Create Booking Success")).toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "guest@example.com",
    );
  });

  it("ignores a late response after a newer availability refresh starts", async () => {
    const original = fetchMock.getMockImplementation()!;
    let first: (response: Response) => void = () => {};
    let second: (response: Response) => void = () => {};
    let count = 0;
    fetchMock.mockImplementation((url: string, options: unknown) => {
      if (!url.startsWith("/api/availability?")) return original(url, options);
      count++;
      return new Promise<Response>((resolve) => {
        if (count === 1) first = resolve;
        else second = resolve;
      });
    });
    await openDay();
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(count).toBe(2));
    await act(async () => {
      first(
        new Response(
          JSON.stringify({ available: false, technicians: [], bays: [] }),
        ),
      );
    });
    expect(
      screen.queryByText("This time is fully booked. Choose another time."),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm appointment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => {
      second(
        new Response(
          JSON.stringify({
            available: true,
            technicians: [{ id: "technician-0", name: "Technician A" }],
            bays: [{ id: "bay-0", name: "Bay 1" }],
          }),
        ),
      );
    });
    expect(await screen.findByText("Available at last check")).toBeTruthy();
  });
});
