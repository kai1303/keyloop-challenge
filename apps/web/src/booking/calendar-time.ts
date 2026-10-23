import { DateTime } from "luxon";

export interface Schedule {
  timeZone: string;
  hours: ({ open: string; close: string } | null)[];
}
export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
}

export function monthDays(month: string, timeZone: string) {
  const first = DateTime.fromISO(month + "-01", { zone: timeZone });
  const start = first.minus({ days: first.weekday - 1 });
  return Array.from({ length: 42 }, (_, index) => start.plus({ days: index }));
}

export function startTimes(
  date: string,
  duration: number,
  schedule: Schedule,
  now = DateTime.utc().toISO()!,
) {
  const day = DateTime.fromISO(date, { zone: schedule.timeZone });
  const hours = schedule.hours[day.weekday - 1];
  if (!hours || duration !== 60) return [];
  const open = DateTime.fromISO(date + "T" + hours.open, {
    zone: schedule.timeZone,
  });
  const close = DateTime.fromISO(date + "T" + hours.close, {
    zone: schedule.timeZone,
  });
  const slots: { label: string; value: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const start = DateTime.fromISO(
      date + "T" + String(hour).padStart(2, "0") + ":00",
      { zone: schedule.timeZone },
    )
      .getPossibleOffsets()
      .reduce((earlier, candidate) =>
        earlier < candidate ? earlier : candidate,
      );
    if (
      start.hour === hour &&
      start.minute === 0 &&
      start >= open &&
      start.plus({ minutes: duration }) <= close &&
      start > DateTime.fromISO(now)
    )
      slots.push({
        label: start.toFormat("HH:mm"),
        value: start.toUTC().toISO()!,
      });
  }
  return slots;
}
