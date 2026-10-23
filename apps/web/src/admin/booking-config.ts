import { createContext, useContext } from "react";
import { DateTime } from "luxon";

export interface BookingScheduleConfig {
  timeZone: string;
  hours: ({ open: string; close: string } | null)[];
}
export interface BookingCatalog {
  services: { id: string; name: string; durationMinutes: number }[];
  technicians: { id: string; name: string; services: string[] }[];
  bays: { id: string; name: string }[];
  schedule: BookingScheduleConfig;
}
export const BookingConfigContext = createContext<BookingCatalog | null>(null);
export function useBookingConfig() {
  const catalog = useContext(BookingConfigContext);
  if (!catalog) throw new Error("Booking configuration is unavailable");
  return catalog;
}
export function bookingToday(
  schedule: BookingScheduleConfig,
  now = new Date(),
) {
  return DateTime.fromJSDate(now).setZone(schedule.timeZone).toISODate()!;
}
export function bookingHours(date: string, schedule: BookingScheduleConfig) {
  return schedule.hours[
    DateTime.fromISO(date, { zone: schedule.timeZone }).weekday - 1
  ];
}
export function bookingStarts(
  date: string,
  schedule: BookingScheduleConfig,
  now = new Date(),
) {
  const hours = bookingHours(date, schedule);
  if (!hours) return [];
  const open = DateTime.fromISO(date + "T" + hours.open, {
    zone: schedule.timeZone,
  });
  const close = DateTime.fromISO(date + "T" + hours.close, {
    zone: schedule.timeZone,
  });
  return Array.from({ length: 24 }, (_, hour) => {
    const candidate = DateTime.fromISO(
      date + "T" + String(hour).padStart(2, "0") + ":00",
      { zone: schedule.timeZone },
    );
    return candidate
      .getPossibleOffsets()
      .reduce(
        (earlier, value) => (value < earlier ? value : earlier),
        candidate,
      );
  })
    .filter(
      (start, hour) =>
        start.hour === hour &&
        start.minute === 0 &&
        start >= open &&
        start.plus({ minutes: 60 }) <= close &&
        start.toMillis() > now.getTime(),
    )
    .map((start) => start.toFormat("HH:mm"));
}
export function nextBookingOpening(
  date: string,
  schedule: BookingScheduleConfig,
) {
  let day = DateTime.fromISO(date, { zone: schedule.timeZone });
  for (let index = 0; index < 14; index++, day = day.plus({ days: 1 })) {
    const value = day.toISODate()!;
    const time = bookingStarts(value, schedule)[0];
    if (time) return { date: value, time };
  }
  throw new Error("No opening hours are configured for booking");
}
export function bookingStartIso(
  date: string,
  time: string,
  schedule: BookingScheduleConfig,
) {
  const candidate = DateTime.fromISO(date + "T" + time, {
    zone: schedule.timeZone,
  });
  if (!candidate.isValid)
    throw new Error("Choose a valid booking date and time");
  return candidate
    .getPossibleOffsets()
    .reduce((earlier, value) => (value < earlier ? value : earlier), candidate)
    .toUTC()
    .toISO()!;
}
