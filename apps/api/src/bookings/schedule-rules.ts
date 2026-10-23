import { BadRequestException } from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';
import type { Interval } from './booking.types.js';

interface Hours {
  open: string;
  close: string;
}
export interface Schedule {
  timeZone: string;
  hours: (Hours | null)[];
}

export function readSchedule(
  env: Record<string, string | undefined> = process.env,
): Schedule {
  const timeZone = env.DEALERSHIP_TIMEZONE;
  if (!timeZone || !IANAZone.isValidZone(timeZone)) {
    throw new Error('DEALERSHIP_TIMEZONE must be an IANA timezone');
  }
  const input: unknown = JSON.parse(env.DEALERSHIP_OPENING_HOURS ?? 'null');
  if (!Array.isArray(input) || input.length !== 7) {
    throw new Error(
      'Opening hours require seven entries, Monday through Sunday',
    );
  }
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const entry of input) {
    if (entry === null) continue;
    if (
      typeof entry !== 'object' ||
      typeof entry.open !== 'string' ||
      typeof entry.close !== 'string' ||
      !time.test(entry.open) ||
      !time.test(entry.close) ||
      entry.open >= entry.close
    ) {
      throw new Error(
        'Each day must be null or a same-day open/close interval',
      );
    }
  }
  return { timeZone, hours: input as (Hours | null)[] };
}

export class ScheduleRules {
  constructor(readonly schedule: Schedule) {}

  daySlots(date: string): Date[] {
    const day = DateTime.fromISO(date, { zone: this.schedule.timeZone });
    if (!day.isValid) throw new BadRequestException('Choose a valid date');
    const hours = this.schedule.hours[day.weekday - 1];
    if (!hours) return [];
    const open = DateTime.fromISO(date + 'T' + hours.open, {
      zone: this.schedule.timeZone,
    });
    const close = DateTime.fromISO(date + 'T' + hours.close, {
      zone: this.schedule.timeZone,
    });
    const slots: Date[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const candidate = DateTime.fromISO(
        date + 'T' + String(hour).padStart(2, '0') + ':00',
        { zone: this.schedule.timeZone },
      );
      // Use the earlier occurrence of a repeated wall hour consistently in preview and confirmation.
      const start = candidate
        .getPossibleOffsets()
        .reduce(
          (earlier, value) => (value < earlier ? value : earlier),
          candidate,
        );
      if (
        start.hour === hour &&
        start.minute === 0 &&
        start >= open &&
        start.plus({ minutes: 60 }) <= close
      ) {
        slots.push(start.toJSDate());
      }
    }
    return slots;
  }

  interval(input: string, durationMinutes: number, now = new Date()): Interval {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(input) || durationMinutes !== 60) {
      throw new BadRequestException(
        'A zoned start time and fixed 60-minute duration are required',
      );
    }
    const start = DateTime.fromISO(input, { setZone: true });
    if (!start.isValid || start.toMillis() <= now.getTime()) {
      throw new BadRequestException('The appointment must start in the future');
    }
    const end = start.plus({ minutes: durationMinutes });
    const local = start.setZone(this.schedule.timeZone);
    if (local.minute !== 0 || local.second !== 0 || local.millisecond !== 0) {
      throw new BadRequestException('Choose a whole-hour start time');
    }
    const date = local.toISODate()!;
    const hours = this.schedule.hours[local.weekday - 1];
    if (!hours) throw new BadRequestException('The dealership is closed');
    const open = DateTime.fromISO(date + 'T' + hours.open, {
      zone: this.schedule.timeZone,
    });
    const close = DateTime.fromISO(date + 'T' + hours.close, {
      zone: this.schedule.timeZone,
    });
    if (
      !end.isValid ||
      start.toMillis() < open.toMillis() ||
      end.toMillis() > close.toMillis()
    ) {
      throw new BadRequestException(
        'The full appointment must fit inside opening hours',
      );
    }
    if (
      !this.daySlots(date).some((slot) => slot.getTime() === start.toMillis())
    ) {
      throw new BadRequestException('Choose an available hourly slot start');
    }
    return { startsAt: start.toJSDate(), endsAt: end.toJSDate(), date };
  }
}
