import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bookingRealtimeClient,
  getBookingCatalog,
  listBookings,
  saveBooking,
  setBookingStatus,
} from "./booking-api";
import { bookingToday } from "./booking-config";
import { watchBookings } from "./watch-bookings";
import type { Booking, BookingDraft, BookingStatus } from "./booking-model";

export function useAdminBookings() {
  const client = useQueryClient();
  const [chosenDate, setDate] = useState("");
  const [connected, setConnected] = useState(false);
  const catalog = useQuery({
    queryKey: ["admin-bookings", "catalog"],
    queryFn: ({ signal }) => getBookingCatalog(signal),
    retry: false,
  });
  const date =
    chosenDate || (catalog.data ? bookingToday(catalog.data.schedule) : "");
  const rows = useQuery({
    queryKey: ["admin-bookings", "day", date],
    queryFn: ({ signal }) => listBookings(date, signal),
    enabled: !!date,
    retry: false,
  });
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ["admin-bookings", "day"] });
  }, [client]);
  useEffect(() => {
    if (!date) return;
    setConnected(false);
    try {
      return watchBookings(bookingRealtimeClient(), date, {
        refresh,
        onConnection: setConnected,
        onError: () => setConnected(false),
      });
    } catch {
      const focus = () => {
        void refresh();
      };
      window.addEventListener("focus", focus);
      return () => window.removeEventListener("focus", focus);
    }
  }, [date, refresh]);
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<Booking>) => operation(),
    onSuccess: async (result) => {
      setDate(result.date);
      await refresh();
    },
  });
  const failure = catalog.error ?? rows.error;
  return {
    catalog: catalog.data,
    date,
    setDate,
    bookings: rows.data ?? [],
    loading: (!catalog.data && !catalog.error) || (!!date && rows.isPending),
    error: failure instanceof Error ? failure.message : null,
    connected,
    busy: mutation.isPending,
    refresh: async () => {
      await catalog.refetch();
      await refresh();
    },
    save: (draft: BookingDraft, previous?: Booking) => {
      if (!catalog.data)
        return Promise.reject(
          new Error("Booking configuration is unavailable"),
        );
      return mutation.mutateAsync(() =>
        saveBooking(draft, catalog.data!.schedule, previous),
      );
    },
    changeStatus: (booking: Booking, status: BookingStatus, reason?: string) =>
      mutation.mutateAsync(() => setBookingStatus(booking, status, reason)),
  };
}
