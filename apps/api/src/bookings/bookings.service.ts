import { DateTime } from 'luxon';
import {
  ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { Database } from '../database/database.js';
import { ScheduleRules } from './schedule-rules.js';
import { availablePair, availableSlots, availableResources } from './available-pair.js';
import type {
  AdminBooking, AdminResourceSelection, Availability, BookingInput, BookingSnapshot, Confirmation, DayAvailability, Interval, ResourcePair, RescheduleInput, ServiceType, StatusInput,
} from './booking.types.js';

import { CandidateChanged, claimResources } from './resource-claims.js';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(Database) private readonly db: DataSource,
    @Inject(ScheduleRules) private readonly rules: ScheduleRules,
  ) {}

  listServices(): Promise<ServiceType[]> {
    return this.db.query(
      'SELECT id, name, duration_minutes AS "durationMinutes" FROM public.service_types ORDER BY name',
    );
  }

  async calendarBookings(month: string): Promise<BookingSnapshot> {
    const start = DateTime.fromISO(month + '-01', { zone: this.rules.schedule.timeZone });
    const rows = await this.db.query<{ startsAt: Date; endsAt: Date; serviceName: string }[]>(
      'SELECT b.starts_at AS "startsAt", b.ends_at AS "endsAt", s.name AS "serviceName" ' +
      'FROM public.service_bookings b JOIN public.service_types s ON s.id=b.service_type_id ' +
      "WHERE b.status <> 'CANCELLED' AND b.ends_at > $1 AND b.starts_at < $2 " +
      'ORDER BY b.starts_at, s.name, b.ends_at, b.id',
      [start.toJSDate(), start.plus({ months: 1 }).toJSDate()],
    );
    return { month, bookings: rows.map(row => ({
      startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), serviceName: row.serviceName,
    })) };
  }

  private async serviceType(manager: EntityManager, id: string): Promise<ServiceType> {
    const rows = await manager.query<ServiceType[]>(
      'SELECT id, name, duration_minutes AS "durationMinutes" FROM public.service_types WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Service type not found');
    return rows[0];
  }

  async availabilitySlots(input: { serviceTypeId: string; date: string }): Promise<DayAvailability> {
    const service = await this.serviceType(this.db.manager, input.serviceTypeId);
    return { serviceTypeId: service.id, date: input.date,
      slots: await availableSlots(this.db.manager, service.id, input.date, this.rules) };
  }

  async availability(input: Pick<BookingInput, 'serviceTypeId' | 'startsAt'>): Promise<Availability> {
    const service = await this.serviceType(this.db.manager, input.serviceTypeId);
    const interval = this.rules.interval(input.startsAt, service.durationMinutes);
    const resources = await availableResources(this.db.manager, service.id, interval);
    return {
      serviceTypeId: service.id, date: interval.date,
      startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString(),
      ...resources, available: resources.technicians.length > 0 && resources.bays.length > 0,
    };
  }

  create(input: BookingInput, selected?: Partial<ResourcePair>): Promise<Confirmation>;
  create(input: BookingInput, selected: Partial<ResourcePair> | undefined, staff: true): Promise<AdminBooking>;
  async create(input: BookingInput, selected?: Partial<ResourcePair>, staff = false): Promise<Confirmation | AdminBooking> {
    const contact = {
      name: input.name.trim(), email: input.email.trim().toLowerCase(),
      phoneNumber: input.phoneNumber.trim(),
      registrationNumber: input.registrationNumber.trim().toUpperCase(),
    };
    return this.bookingTransaction(async manager => {
      const service = await this.serviceType(manager, input.serviceTypeId);
      const interval = this.rules.interval(input.startsAt, service.durationMinutes);
      const pair = await this.allocate(manager, service.id, interval, selected);
      this.rules.interval(input.startsAt, service.durationMinutes);

      await manager.query(
        'INSERT INTO public.users (name, email, phone_number) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (email) DO NOTHING',
        [contact.name, contact.email, contact.phoneNumber],
      );
      const [customer] = await manager.query<{ id: string }[]>(
        'SELECT id FROM public.users WHERE email = $1', [contact.email],
      );
      await manager.query(
        'INSERT INTO public.booking_vehicles (user_id, registration_number) VALUES ($1, $2) ' +
        'ON CONFLICT (user_id, registration_number) DO NOTHING',
        [customer.id, contact.registrationNumber],
      );
      const [vehicle] = await manager.query<{ id: string }[]>(
        'SELECT id FROM public.booking_vehicles WHERE user_id = $1 AND registration_number = $2',
        [customer.id, contact.registrationNumber],
      );
      const [booking] = await manager.query<{
        id: string; status: 'CONFIRMED'; startsAt: Date; endsAt: Date;
      }[]>(
        'INSERT INTO public.service_bookings ' +
        '(user_id, vehicle_id, service_type_id, technician_id, service_bay_id, starts_at, ends_at, ' +
        'submitted_name, submitted_email, submitted_phone_number, booking_date, slot_number) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ' +
        'RETURNING id, status, starts_at AS "startsAt", ends_at AS "endsAt"',
        [
          customer.id, vehicle.id, service.id, pair.technicianId, pair.bayId,
          interval.startsAt, interval.endsAt, contact.name, contact.email, contact.phoneNumber,
          interval.date, DateTime.fromJSDate(interval.startsAt).setZone(this.rules.schedule.timeZone).hour,
        ],
      );
      const confirmation: Confirmation = {
        id: booking.id, service, registrationNumber: contact.registrationNumber,
        startsAt: booking.startsAt.toISOString(), endsAt: booking.endsAt.toISOString(),
        status: booking.status,
      };
      return staff ? (await this.readBookings(manager, 'b.id = $1', [booking.id]))[0] : confirmation;
    });
  }

  private async bookingTransaction<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.transaction('READ COMMITTED', async manager => {
          await manager.query(
            "SELECT set_config('lock_timeout', '2s', true), " +
            "set_config('statement_timeout', '5s', true), " +
            "set_config('scheduler.timezone', $1, true)",
            [this.rules.schedule.timeZone],
          );
          return operation(manager);
        });
      } catch (error) {
        const failure = error as { driverError?: { code?: string }; code?: string };
        const code = failure?.driverError?.code ?? failure?.code;
        if (error instanceof CandidateChanged || code === '40P01' || code === '55P03') continue;
        throw error;
      }
    }
    throw new ServiceUnavailableException('Booking contention; retry confirmation');
  }

  private async allocate(
    manager: EntityManager, serviceTypeId: string, interval: Interval,
    selected?: Partial<ResourcePair>, excludeBookingId?: string, previous?: ResourcePair,
  ): Promise<ResourcePair> {
    const pair = await availablePair(manager, serviceTypeId, interval, selected, excludeBookingId);
    if (!pair) throw new ConflictException('No qualified technician and bay are available');
    await claimResources(manager, ...(previous ? [previous, pair] : [pair]));
    // A fresh read after successful CAS claims catches bookings committed since the preview.
    if (!await availablePair(manager, serviceTypeId, interval, pair, excludeBookingId)) throw new CandidateChanged();
    return pair;
  }

  async adminCatalog() {
    const [services, technicians, bays] = await Promise.all([
      this.listServices(),
      this.db.query<{ id: string; name: string; services: string[] }[]>(
        'SELECT t.id, t.name, COALESCE(array_agg(q.service_type_id ORDER BY q.service_type_id) ' +
        "FILTER (WHERE q.service_type_id IS NOT NULL), '{}') AS services FROM public.users t " +
        "LEFT JOIN public.technician_service_types q ON q.technician_id = t.id WHERE t.role = 'technician' AND COALESCE(t.banned,false)=false GROUP BY t.id ORDER BY t.name, t.id",
      ),
      this.db.query<{ id: string; name: string }[]>('SELECT id, name FROM public.service_bays ORDER BY name, id'),
    ]);
    return { services, technicians, bays, schedule: this.rules.schedule };
  }

  async listBookings(date: string): Promise<AdminBooking[]> {
    const day = DateTime.fromISO(date, { zone: this.rules.schedule.timeZone });
    return this.readBookings(this.db.manager, 'b.starts_at >= $1 AND b.starts_at < $2',
      [day.toJSDate(), day.plus({ days: 1 }).toJSDate()]);
  }

  async findBooking(id: string): Promise<AdminBooking> {
    const [booking] = await this.readBookings(this.db.manager, 'b.id = $1', [id]);
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private async readBookings(manager: EntityManager, predicate: string, values: unknown[]): Promise<AdminBooking[]> {
    const rows = await manager.query<(Omit<AdminBooking, 'startsAt' | 'endsAt' | 'date' | 'time' | 'durationMinutes' | 'cancellationReason'> & {
      startsAt: Date; endsAt: Date; cancellationReason: string | null;
    })[]>(
      'SELECT b.id, b.submitted_name AS name, b.submitted_email AS email, b.submitted_phone_number AS "phoneNumber", ' +
      'v.registration_number AS "registrationNumber", b.service_type_id AS "serviceTypeId", ' +
      'b.technician_id AS "technicianId", b.service_bay_id AS "serviceBayId", b.status, ' +
      'b.cancellation_reason AS "cancellationReason", b.version, b.starts_at AS "startsAt", b.ends_at AS "endsAt" ' +
      'FROM public.service_bookings b JOIN public.booking_vehicles v ON v.id = b.vehicle_id ' +
      'WHERE ' + predicate + ' ORDER BY b.starts_at, b.id', values,
    );
    return rows.map(({ cancellationReason, ...row }) => {
      const start = DateTime.fromJSDate(row.startsAt).setZone(this.rules.schedule.timeZone);
      return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
        date: start.toISODate()!, time: start.toFormat('HH:mm'),
        durationMinutes: (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000,
        ...(cancellationReason === null ? {} : { cancellationReason }),
      };
    });
  }

  async createAdmin(input: BookingInput & AdminResourceSelection): Promise<AdminBooking> {
    return this.create(input, { technicianId: input.technicianId, bayId: input.serviceBayId }, true);
  }

  private async currentBooking(manager: EntityManager, id: string, expectedVersion: number) {
    const [booking] = await manager.query<{ serviceTypeId: string; status: AdminBooking['status']; version: number; technicianId: string; bayId: string; startsAt: Date; endsAt: Date }[]>(
      'SELECT service_type_id AS "serviceTypeId", status, version, technician_id AS "technicianId", service_bay_id AS "bayId", starts_at AS "startsAt", ends_at AS "endsAt" FROM public.service_bookings WHERE id = $1', [id],
    );
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.version !== expectedVersion) throw new ConflictException('Booking changed; refresh before editing');
    return booking;
  }

  reschedule(id: string, input: RescheduleInput): Promise<AdminBooking> {
    return this.bookingTransaction(async manager => {
      const booking = await this.currentBooking(manager, id, input.expectedVersion);
      if (booking.status !== 'CONFIRMED') throw new ConflictException('Only confirmed bookings can be rescheduled');
      const service = await this.serviceType(manager, booking.serviceTypeId);
      const interval = this.rules.interval(input.startsAt, service.durationMinutes);
      const pair = await this.allocate(manager, service.id, interval,
        { technicianId: input.technicianId, bayId: input.serviceBayId }, id, booking);
      this.rules.interval(input.startsAt, service.durationMinutes);
      const updated = await manager.query<{ id: string }[]>(
        'WITH changed AS (UPDATE public.service_bookings SET starts_at=$2, ends_at=$3, technician_id=$4, service_bay_id=$5, ' +
        'booking_date=$6, slot_number=$7, version=version+1 WHERE id=$1 AND version=$8 RETURNING id) SELECT id FROM changed',
        [id, interval.startsAt, interval.endsAt, pair.technicianId, pair.bayId, interval.date,
          DateTime.fromJSDate(interval.startsAt).setZone(this.rules.schedule.timeZone).hour, input.expectedVersion],
      );
      if (!updated.length) throw new ConflictException('Booking changed; refresh before editing');
      return (await this.readBookings(manager, 'b.id = $1', [id]))[0];
    });
  }

  changeStatus(id: string, input: StatusInput): Promise<AdminBooking> {
    return this.bookingTransaction(async manager => {
      const booking = await this.currentBooking(manager, id, input.expectedVersion);
      const legal = booking.status === 'CONFIRMED' && (input.status === 'IN_SERVICE' || input.status === 'CANCELLED') ||
        booking.status === 'IN_SERVICE' && input.status === 'COMPLETED';
      if (!legal) throw new ConflictException('Invalid booking status transition');
      await claimResources(manager, booking);
      const updated = await manager.query<{ id: string }[]>(
        'WITH changed AS (UPDATE public.service_bookings SET status=$2, cancellation_reason=$3, version=version+1 WHERE id=$1 AND version=$4 RETURNING id) SELECT id FROM changed',
        [id, input.status, input.status === 'CANCELLED' ? input.cancellationReason?.trim() || null : null, input.expectedVersion],
      );
      if (!updated.length) throw new ConflictException('Booking changed; refresh before editing');
      return (await this.readBookings(manager, 'b.id = $1', [id]))[0];
    });
  }
}
