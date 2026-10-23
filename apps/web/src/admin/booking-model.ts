export const STATUSES = {
  CONFIRMED: "Confirmed",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;
export type BookingStatus = keyof typeof STATUSES;
export interface BookingDraft {
  name: string;
  email: string;
  phoneNumber: string;
  registrationNumber: string;
  serviceTypeId: string;
  date: string;
  time: string;
  technicianId: string;
  serviceBayId: string;
}
export interface Booking extends BookingDraft {
  id: string;
  version: number;
  durationMinutes: number;
  status: BookingStatus;
  cancellationReason?: string;
}
export interface BookingFilters {
  date: string;
  search: string;
  status: BookingStatus | "all";
  technicianId: string;
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
export function clock(value: number): string {
  return (
    String(Math.floor(value / 60)).padStart(2, "0") +
    ":" +
    String(value % 60).padStart(2, "0")
  );
}
export function endTime(
  booking: Pick<Booking, "time" | "durationMinutes">,
): string {
  return clock(minutes(booking.time) + booking.durationMinutes);
}
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
export function filterBookings(
  bookings: Booking[],
  filters: BookingFilters,
): Booking[] {
  const search = filters.search.trim().toLowerCase();
  return bookings
    .filter(
      (booking) =>
        booking.date === filters.date &&
        (filters.status === "all" || booking.status === filters.status) &&
        (filters.technicianId === "all" ||
          booking.technicianId === filters.technicianId) &&
        [
          booking.id,
          booking.name,
          booking.email,
          booking.phoneNumber,
          booking.registrationNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search),
    )
    .sort(
      (left, right) =>
        left.time.localeCompare(right.time) ||
        left.serviceBayId.localeCompare(right.serviceBayId),
    );
}
