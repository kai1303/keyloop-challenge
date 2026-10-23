import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

const oil = '00000000-0000-4000-8000-000000000001';
const inspection = '00000000-0000-4000-8000-000000000002';
const techA = '00000000-0000-4000-8000-000000000011';
const techB = '00000000-0000-4000-8000-000000000012';
const bayA = '00000000-0000-4000-8000-000000000021';
const bayB = '00000000-0000-4000-8000-000000000022';
const input = (index = 0) => ({ name: 'Submitted Guest', email: `admin${index}@example.com`, phoneNumber: '+84901234567', registrationNumber: `ADMIN${index}`, serviceTypeId: oil, startsAt: '2030-01-02T10:00:00Z' });

describe('persistent admin booking operations', () => {
  const db = testDatabase();
  const service = new BookingsService(db, new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill({ open: '09:00', close: '17:00' }) }));
  beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
  beforeEach(async () => {
    await db.query('TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types');
    await db.transaction(seedCatalog);
  });
  afterAll(async () => { if (db.isInitialized) await db.destroy(); });

  it('loads database catalog qualifications and dealership-local dates without changing legacy duration', async () => {
    const catalog = await service.adminCatalog();
    expect(catalog.services).toHaveLength(2);
    expect(catalog.technicians.find(item => item.id === techA)?.services).toEqual([oil]);
    expect(catalog.bays).toHaveLength(2);
    const first = await service.createAdmin(input());
    expect(first).toMatchObject({ name: 'Submitted Guest', email: 'admin0@example.com', phoneNumber: '+84901234567', registrationNumber: 'ADMIN0', serviceTypeId: oil, date: '2030-01-02', time: '10:00', technicianId: techA, serviceBayId: bayA, durationMinutes: 60, status: 'CONFIRMED', version: 1 });
    await db.query("UPDATE public.service_bookings SET starts_at=starts_at-interval '30 minutes', ends_at=ends_at+interval '15 minutes' WHERE id=$1", [first.id]);
    const local = new BookingsService(db, new ScheduleRules({ timeZone: 'Asia/Ho_Chi_Minh', hours: [] }));
    expect((await local.listBookings('2030-01-02'))[0]).toMatchObject({ id: first.id, time: '16:30', durationMinutes: 105 });
    expect(await service.reschedule(first.id, { startsAt: '2030-01-02T12:00:00Z', expectedVersion: 1 })).toMatchObject({ id: first.id, durationMinutes: 60, version: 2 });
  });
  it('honors either manual resource and rejects unqualified, missing and occupied assignments', async () => {
    expect(await service.createAdmin({ ...input(), serviceBayId: bayB })).toMatchObject({ technicianId: techA, serviceBayId: bayB });
    await expect(service.createAdmin({ ...input(1), technicianId: techA, serviceBayId: bayA })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createAdmin({ ...input(2), technicianId: techB })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createAdmin({ ...input(3), serviceBayId: '00000000-0000-4000-8000-000000000099' })).rejects.toBeInstanceOf(ConflictException);
    expect(await service.createAdmin({ ...input(4), serviceTypeId: inspection, technicianId: techB })).toMatchObject({ technicianId: techB, serviceBayId: bayA });
  });
  it('reschedules excluding itself, retains the booking identity and submitted contact, increments versions', async () => {
    const first = await service.createAdmin(input());
    const same = await service.reschedule(first.id, { startsAt: first.startsAt, expectedVersion: 1, technicianId: techA, serviceBayId: bayA });
    expect(same).toMatchObject({ id: first.id, version: 2, startsAt: first.startsAt });
    await expect(service.reschedule(first.id, { startsAt: '2030-01-02T12:00:00Z', expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictException);
    const moved = await service.reschedule(first.id, { startsAt: '2030-01-03T12:00:00Z', expectedVersion: 2, serviceBayId: bayB });
    expect(moved).toMatchObject({ id: first.id, version: 3, email: first.email, date: '2030-01-03', time: '12:00', durationMinutes: 60, serviceBayId: bayB });
    expect(await service.listBookings('2030-01-02')).toEqual([]);
    expect(await service.listBookings('2030-01-03')).toEqual([moved]);
  });
  it('rolls back a conflicting move without releasing the original booking', async () => {
    const first = await service.createAdmin(input());
    await service.createAdmin({ ...input(1), startsAt: '2030-01-02T11:00:00Z' });
    await expect(service.reschedule(first.id, { startsAt: '2030-01-02T11:00:00Z', expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect((await service.listBookings('2030-01-02')).find(row => row.id === first.id)).toEqual(first);
    await expect(service.createAdmin(input(2))).rejects.toBeInstanceOf(ConflictException);
  });
  it('allows only one concurrent edit for a version and one winner against a racing create', async () => {
    const first = await service.createAdmin(input());
    const versions = await Promise.allSettled([
      service.reschedule(first.id, { startsAt: '2030-01-02T11:00:00Z', expectedVersion: 1 }),
      service.changeStatus(first.id, { status: 'CANCELLED', expectedVersion: 1 }),
    ]);
    expect(versions.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(versions.find(row => row.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
    const other = await service.createAdmin({ ...input(1), startsAt: '2030-01-04T10:00:00Z' });
    const racing = await Promise.allSettled([
      service.reschedule(other.id, { startsAt: '2030-01-05T10:00:00Z', expectedVersion: 1 }),
      service.createAdmin({ ...input(2), startsAt: '2030-01-05T10:00:00Z' }),
    ]);
    expect(racing.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  });
  it('retains occupancy and public calendar entries through service/completion, cancellation releases resources', async () => {
    const first = await service.createAdmin(input());
    const active = await service.changeStatus(first.id, { status: 'IN_SERVICE', expectedVersion: 1 });
    expect(active).toMatchObject({ status: 'IN_SERVICE', version: 2 });
    await expect(service.createAdmin(input(1))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reschedule(first.id, { startsAt: '2030-01-02T12:00:00Z', expectedVersion: 2 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.changeStatus(first.id, { status: 'CANCELLED', expectedVersion: 2 })).rejects.toBeInstanceOf(ConflictException);
    const completed = await service.changeStatus(first.id, { status: 'COMPLETED', expectedVersion: 2 });
    expect(completed).toMatchObject({ status: 'COMPLETED', version: 3 });
    await expect(service.createAdmin(input(1))).rejects.toBeInstanceOf(ConflictException);
    expect((await service.calendarBookings('2030-01')).bookings).toHaveLength(1);
    const cancellable = await service.createAdmin({ ...input(2), startsAt: '2030-01-02T11:00:00Z' });
    await expect(service.changeStatus(cancellable.id, { status: 'COMPLETED', expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictException);
    const cancelled = await service.changeStatus(cancellable.id, { status: 'CANCELLED', expectedVersion: 1, cancellationReason: ' Customer requested ' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Customer requested', version: 2 });
    expect((await service.calendarBookings('2030-01')).bookings).toHaveLength(1);
    expect(await service.createAdmin({ ...input(3), startsAt: cancellable.startsAt })).toHaveProperty('id');
    await expect(service.changeStatus(cancellable.id, { status: 'CONFIRMED', expectedVersion: 2 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.changeStatus('00000000-0000-4000-8000-000000000099', { status: 'CANCELLED', expectedVersion: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('locks the union of previous and next resources during opposing reschedules', async () => {
    await db.query('INSERT INTO public.technician_service_types VALUES ($1,$2)', [techB,oil]);
    const first = await service.createAdmin({ ...input(), technicianId: techA, serviceBayId: bayA });
    const second = await service.createAdmin({ ...input(1), startsAt: '2030-01-02T11:00:00Z', technicianId: techB, serviceBayId: bayB });
    const moved = await Promise.all([
      service.reschedule(first.id,{ startsAt:'2030-01-02T12:00:00Z',technicianId:techB,serviceBayId:bayB,expectedVersion:1 }),
      service.reschedule(second.id,{ startsAt:'2030-01-02T13:00:00Z',technicianId:techA,serviceBayId:bayA,expectedVersion:1 }),
    ]);
    expect(moved[0]).toMatchObject({ technicianId:techB,serviceBayId:bayB,version:2 });
    expect(moved[1]).toMatchObject({ technicianId:techA,serviceBayId:bayA,version:2 });
    expect(await service.createAdmin({ ...input(2),technicianId:techA,serviceBayId:bayA })).toHaveProperty('id');
  });

  it('waits for the resource lock before cancelling and releases capacity after commit', async () => {
    const first = await service.createAdmin(input());
    const runner = db.createQueryRunner();
    await runner.connect(); await runner.startTransaction();
    await runner.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[first.technicianId]);
    const pending = service.changeStatus(first.id,{ status:'CANCELLED',expectedVersion:1 });
    const settled = pending.then(value=>({ value }),error=>({ error }));
    let observed = false;
    try {
      for(let attempt=0;attempt<100;attempt++) {
        const [row] = await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name='appointment-scheduler' AND wait_event_type='Lock' AND query LIKE '%public.users%FOR UPDATE%'");
        if(row.count) { observed = true; break; }
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observed).toBe(true);
      expect((await service.findBooking(first.id)).status).toBe('CONFIRMED');
    } finally { await runner.commitTransaction(); await runner.release(); await settled; }
    await expect(pending).resolves.toMatchObject({ status:'CANCELLED',version:2 });
    expect(await service.createAdmin(input(1))).toHaveProperty('id');
  });

});
