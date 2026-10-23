import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { bookingRequest } from "./booking-api";
import { publicRealtimeClient } from "./public-realtime";
import { watchAvailability } from "./watch-availability";

export interface CalendarBooking {
  startsAt: string;
  endsAt: string;
  serviceName: string;
}
interface BookingSnapshot {
  month: string;
  bookings: CalendarBooking[];
}

export function useCalendarBookings(
  month: string,
  timeZone: string | undefined,
) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    month: string;
    data: BookingSnapshot | null;
    error: string;
  }>();

  useEffect(() => {
    if (!timeZone) return;
    let active = true;
    let request: AbortController | undefined;
    async function refresh() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const data = await bookingRequest<BookingSnapshot>(
          "bookings?" + new URLSearchParams({ month }),
          { signal: controller.signal },
        );
        if (active && !controller.signal.aborted)
          setSnapshot({ month, data, error: "" });
      } catch (failure) {
        if (active && !controller.signal.aborted)
          setSnapshot({
            month,
            data: null,
            error:
              failure instanceof Error
                ? failure.message
                : "Unable to load appointments",
          });
      }
    }
    let stop: () => void;
    try {
      const first = DateTime.fromISO(month + "-01", { zone: timeZone });
      const dates = Array.from({ length: first.daysInMonth! }, (_, day) =>
        first.plus({ days: day }).toISODate()!,
      );
      stop = watchAvailability(publicRealtimeClient(), dates, {
        initialLoad: true,
        refresh,
        onConnection: () => {},
        onError: () =>
          setSnapshot({
            month,
            data: null,
            error: "Unable to refresh appointments",
          }),
      });
    } catch {
      void refresh();
      const focus = () => {
        void refresh();
      };
      window.addEventListener("focus", focus);
      stop = () => window.removeEventListener("focus", focus);
    }
    return () => {
      active = false;
      request?.abort();
      stop();
    };
  }, [month, timeZone, attempt]);

  const current = snapshot?.month === month ? snapshot : undefined;
  return {
    items: current?.data?.bookings ?? [],
    error: current?.error ?? "",
    loading: !current,
    refresh: () => setAttempt((value) => value + 1),
  };
}
