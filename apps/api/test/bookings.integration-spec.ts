import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';
import { CandidateChanged, claimResources } from '../src/bookings/resource-claims.js';

const oil = '00000000-0000-4000-8000-000000000001';
const inspection = '00000000-0000-4000-8000-000000000002';
const techA = '00000000-0000-4000-8000-000000000011';
const bayA = '00000000-0000-4000-8000-000000000021';
const bayB = '00000000-0000-4000-8000-000000000022';
const base = DateTime.utc().plus({ days: 1 }).startOf('day').plus({ hours: 10 });
const at = (minutes = 0) => base.plus({ minutes }).toISO()!;

describe('booking persistence and optimistic resource versions', () => {
  const db = testDatabase();
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' })),
  });
  const service = new BookingsService(db, rules);
  const input = (email: string, serviceTypeId = oil, minutes = 0) => ({
    name: 'Guest', email, phoneNumber: '+84901234567',
    registrationNumber: email.split('@')[0], serviceTypeId, startsAt: at(minutes),
  });

  beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, ' +
      'public.technician_service_types, ' +
      'public.service_bays, public.service_types',
    );
    await db.transaction(seedCatalog);
  });
  afterAll(async () => { if (db.isInitialized) await db.destroy(); });

  async function hold(table: 'technicians' | 'service_bays', id: string) {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('UPDATE public.' + (table === 'technicians' ? 'users' : 'service_bays') + ' SET scheduling_version=scheduling_version+1 WHERE id=$1', [id]);
    return async () => {
      try { await runner.commitTransaction(); }
      finally { await runner.release(); }
    };
  }

  async function waiterCount(table: string): Promise<number> {
    const [row] = await db.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM pg_stat_activity ' +
      "WHERE datname = current_database() AND application_name = 'appointment-scheduler' " +
      "AND wait_event_type = 'Lock' AND query LIKE $1", ['%UPDATE public.' + (table === 'technicians' ? 'users' : 'service_bays') + '%scheduling_version%'],
    );
    return row.count;
  }

  async function waitForWaiters(table: string, expected: number): Promise<void> {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      if (await waiterCount(table) >= expected) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected concurrent conditional-write waiters did not appear');
  }

  it('lists only public fields in dealership-local month order, including simultaneous bookings', async () => {
    const calendar = new BookingsService(db, new ScheduleRules({
      timeZone: 'America/Los_Angeles',
      hours: Array.from({ length: 7 }, () => ({ open: '00:00', close: '23:59' })),
    }));
    for (const [index, startsAt] of [
      '2030-06-01T05:00:00Z', '2030-06-01T07:00:00Z',
      '2030-07-01T05:00:00Z', '2030-07-01T07:00:00Z',
    ].entries()) {
      await calendar.create({ ...input(`calendar${index}@example.com`), startsAt });
    }
    await calendar.create({ ...input('parallel@example.com', inspection), startsAt: '2030-06-01T07:00:00Z' });
    const snapshot = await calendar.calendarBookings('2030-06');
    expect(snapshot).toEqual({ month: '2030-06', bookings: [
      { startsAt: '2030-06-01T07:00:00.000Z', endsAt: '2030-06-01T08:00:00.000Z', serviceName: 'Inspection' },
      { startsAt: '2030-06-01T07:00:00.000Z', endsAt: '2030-06-01T08:00:00.000Z', serviceName: 'Oil change' },
      { startsAt: '2030-07-01T05:00:00.000Z', endsAt: '2030-07-01T06:00:00.000Z', serviceName: 'Oil change' },
    ] });
    expect(JSON.stringify(snapshot)).not.toContain('example.com');
    expect((await calendar.calendarBookings('2029-01')).bookings).toEqual([]);
  });

  it('includes bookings crossing the month boundary and bay use by a banned technician', async () => {
    const saved = await service.create({ ...input('boundary@example.com'), startsAt: '2030-01-31T16:00:00Z' });
    await db.query("UPDATE public.service_bookings SET ends_at='2030-02-01T10:15:00Z' WHERE id=$1", [saved.id]);
    await db.query('UPDATE public.users SET banned=true WHERE id=$1', [techA]);
    const snapshot = await service.calendarBookings('2030-02');
    expect(snapshot.bookings).toEqual([{
      startsAt: '2030-01-31T16:00:00.000Z', endsAt: '2030-02-01T10:15:00.000Z',
      serviceName: 'Oil change',
    }]);
    expect(Object.keys(snapshot).sort()).toEqual(['bookings', 'month']);
    expect(await service.availability({ serviceTypeId: inspection, startsAt: '2030-02-01T10:00:00Z' })).toMatchObject({ bays: [{ id: bayB, name: 'Bay B' }] });
  });

  it('honors a selected pair and rejects it when busy instead of assigning another pair', async () => {
    const techB = '00000000-0000-4000-8000-000000000012';
    await db.query('INSERT INTO public.technician_service_types VALUES ($1,$2)', [techB, oil]);
    const selected = { technicianId: techA, bayId: bayB };
    const first = await service.create(input('selected@example.com'), selected);
    expect(await service.findBooking(first.id)).toMatchObject({ technicianId: techA, serviceBayId: bayB });
    // Another pair remains free, but an explicit selection must never fall back to it.
    expect(await service.availability({ serviceTypeId: oil, startsAt: at() })).toMatchObject({ available: true });
    await expect(service.create(input('same-selected@example.com'), selected)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create(input('unknown@example.com'), { technicianId: 'not-a-technician', bayId: bayA })).rejects.toBeInstanceOf(ConflictException);
    await db.query('UPDATE public.users SET banned=true WHERE id=$1', [techB]);
    await expect(service.create(input('banned@example.com'), { technicianId: techB, bayId: bayA })).rejects.toBeInstanceOf(ConflictException);
    expect(await db.query('SELECT id FROM public.service_bookings')).toHaveLength(1);
  });

  it('returns free named resources directly for the selected interval', async () => {
    const techB = '00000000-0000-4000-8000-000000000012';
    await db.query('INSERT INTO public.technician_service_types VALUES ($1,$2)', [techB, oil]);
    await service.create(input('busy-sql@example.com'), { technicianId: techA, bayId: bayA });
    const result = await service.availability({ serviceTypeId: oil, startsAt: at() });
    expect(result).toMatchObject({ available: true,
      technicians: [{ id: techB, name: 'Technician B' }],
      bays: [{ id: bayB, name: 'Bay B' }],
    });
    const adjacent = await service.availability({ serviceTypeId: oil, startsAt: at(60) });
    expect(adjacent.technicians).toHaveLength(2);
    expect(adjacent.bays).toHaveLength(2);
    await db.query('UPDATE public.users SET banned=true WHERE id=$1', [techB]);
    expect(await service.availability({ serviceTypeId: oil, startsAt: at() })).toMatchObject({ available: false, technicians: [], bays: [{ id: bayB, name: 'Bay B' }] });
  });

  it('requires the same resources to stay free throughout the interval, even when spare capacity switches midway', async () => {
    const techB = '00000000-0000-4000-8000-000000000012';
    await db.query('INSERT INTO public.technician_service_types VALUES ($1,$2)', [techB, oil]);
    const first = await service.create(input('first-half@example.com'), { technicianId: techA, bayId: bayA });
    const second = await service.create(input('second-half@example.com', oil, 60), { technicianId: techB, bayId: bayB });
    await db.query('UPDATE public.service_bookings SET ends_at=$2 WHERE id=$1', [first.id, at(30)]);
    await db.query('UPDATE public.service_bookings SET starts_at=$2 WHERE id=$1', [second.id, at(30)]);
    const result = await service.availability({ serviceTypeId: oil, startsAt: at() });
    expect(result).toMatchObject({ available: false, technicians: [], bays: [] });
  });

  it('checks all starts against full-duration conflicts and remaining qualified capacity', async () => {
    await service.create(input('busy@example.com', inspection));
    const date = base.toISODate()!;
    const snapshot = await service.availabilitySlots({ date, serviceTypeId: oil });
    const atSlot = (value: string) => snapshot.slots.find(slot => slot.startsAt === value);
    expect(atSlot(at(0))).toMatchObject({ available: true });
    await service.create(input('oil-busy@example.com'));
    const full = await service.availabilitySlots({ date, serviceTypeId: oil });
    const available = (minutes: number) => full.slots.find(slot => slot.startsAt === base.plus({ minutes }).toUTC().toISO())?.available;
    expect(available(-60)).toBe(true);
    expect(available(-15)).toBeUndefined();
    expect(available(0)).toBe(false);
    expect(available(15)).toBeUndefined();
    expect(available(60)).toBe(true);
    expect(Object.keys(full.slots[0]).sort()).toEqual(['available', 'endsAt', 'startsAt']);
    await db.query('DELETE FROM public.technician_service_types WHERE service_type_id=$1', [oil]);
    expect((await service.availabilitySlots({ date, serviceTypeId: oil })).slots.every(slot => !slot.available)).toBe(true);
  });

  it('generates dealership-local opening-aligned starts with full service duration', async () => {
    const local = new BookingsService(db, new ScheduleRules({
      timeZone: 'Asia/Ho_Chi_Minh',
      hours: Array.from({ length: 7 }, () => ({ open: '09:10', close: '12:10' })),
    }));
    const date = '2030-01-02';
    const expected = [
      { startsAt: '2030-01-02T03:00:00.000Z', endsAt: '2030-01-02T04:00:00.000Z', available: true },
      { startsAt: '2030-01-02T04:00:00.000Z', endsAt: '2030-01-02T05:00:00.000Z', available: true },
    ];
    expect((await local.availabilitySlots({ date, serviceTypeId: oil })).slots).toEqual(expected);
    expect((await local.availabilitySlots({ date, serviceTypeId: inspection })).slots).toEqual(expected);
    expect((await local.availabilitySlots({ date: '2020-01-02', serviceTypeId: oil })).slots).toEqual([]);
    const closed = new BookingsService(db, new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill(null) }));
    expect((await closed.availabilitySlots({ date, serviceTypeId: oil })).slots).toEqual([]);
    await expect(local.availabilitySlots({ date, serviceTypeId: '00000000-0000-4000-8000-000000000099' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists all associations and the fixed service interval', async () => {
    const result = await service.create(input('first@example.com'));
    const [row] = await db.query(
      'SELECT b.*, b.booking_date::text AS booking_date, u.email, v.registration_number FROM public.service_bookings b ' +
      'JOIN public.users u ON u.id=b.user_id JOIN public.booking_vehicles v ON v.id=b.vehicle_id ' +
      'JOIN public.users t ON t.id=b.technician_id ' +
      'JOIN public.service_bays bay ON bay.id=b.service_bay_id ' +
      'JOIN public.service_types s ON s.id=b.service_type_id WHERE b.id=$1', [result.id],
    );
    expect(row.email).toBe('first@example.com');
    expect(row.registration_number).toBe('FIRST');
    expect(row.ends_at.getTime() - row.starts_at.getTime()).toBe(60 * 60_000);
    expect(row.booking_date).toBe(base.toISODate());
    expect(row.slot_number).toBe(10);
    expect(result).not.toHaveProperty('submittedEmail');
  });

  it('reuses normalized email without overwriting contact details', async () => {
    await service.create(input('guest@example.com'));
    await service.create({
      ...input(' Guest@Example.com ', oil, 60),
      name: 'Different submitted name', phoneNumber: '+84909999999',
      registrationNumber: 'SECOND',
    });
    const customers = await db.query('SELECT name, email, phone_number FROM public.users WHERE role=\'customer\'');
    expect(customers).toEqual([{
      name: 'Guest', email: 'guest@example.com', phone_number: '+84901234567',
    }]);
    const [snapshot] = await db.query(
      "SELECT submitted_name, submitted_phone_number FROM public.service_bookings WHERE submitted_name = $1",
      ['Different submitted name'],
    );
    expect(snapshot.submitted_phone_number).toBe('+84909999999');
  });

  it('enforces normalized email and uniqueness in PostgreSQL', async () => {
    await service.create(input('unique@example.com'));
    await expect(db.query(
      'INSERT INTO public.users (name,email,phone_number) VALUES ($1,$2,$3)',
      ['Guest', 'unique@example.com', '+84901234567'],
    )).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(db.query(
      'INSERT INTO public.users (name,email,phone_number) VALUES ($1,$2,$3)',
      ['Guest', 'UPPER@example.com', '+84901234567'],
    )).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('rejects a service without any qualified technician', async () => {
    await db.query('DELETE FROM public.technician_service_types WHERE service_type_id=$1', [oil]);
    await expect(service.create(input('unqualified@example.com')))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the technician is occupied although another bay is free', async () => {
    await service.create(input('occupied@example.com'));
    await expect(service.create(input('next@example.com', oil, 0)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the only bay is occupied although a qualified technician is free', async () => {
    await db.query('DELETE FROM public.service_bays WHERE id=$1', [bayB]);
    await service.create(input('occupant@example.com', inspection));
    await expect(service.create(input('oil@example.com'))).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([-15, 15, 5])('rejects off-grid starts %s minutes', async minutes => {
    await expect(service.create(input('off-grid@example.com', oil, minutes)))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces 60-minute catalog durations in PostgreSQL', async () => {
    await expect(db.query('UPDATE public.service_types SET duration_minutes=30 WHERE id=$1', [oil]))
      .rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('allows adjacent hourly bookings', async () => {
    const first = await service.create(input('first@example.com'));
    const next = await service.create(input('second@example.com', oil, 60));
    expect(first.endsAt).toBe(next.startsAt);
  });

  it('preserves historical off-grid intervals and blocks every touched hour', async () => {
    const first = await service.create(input('legacy@example.com'));
    await db.query(
      "UPDATE public.service_bookings SET starts_at=starts_at-interval '30 minutes', " +
      "ends_at=ends_at-interval '30 minutes',slot_number=9 WHERE id=$1", [first.id],
    );
    const snapshot = await service.availabilitySlots({ date: base.toISODate()!, serviceTypeId: oil });
    const free = (minutes: number) => snapshot.slots.find(slot => slot.startsAt === base.plus({ minutes }).toUTC().toISO())?.available;
    expect(free(-60)).toBe(false);
    expect(free(0)).toBe(false);
    expect(free(60)).toBe(true);
    const [stored] = await db.query('SELECT starts_at, ends_at FROM public.service_bookings WHERE id=$1', [first.id]);
    expect(stored.starts_at.toISOString()).toBe(base.minus({ minutes: 30 }).toUTC().toISO());
    expect(stored.ends_at.toISOString()).toBe(base.plus({ minutes: 30 }).toUTC().toISO());
  });

  it('keeps the same slot on different dates independent', async () => {
    await service.create(input('today@example.com'));
    await expect(service.create({ ...input('tomorrow@example.com'), startsAt: base.plus({ days: 1 }).toISO()! }))
      .resolves.toHaveProperty('id');
  });

  it('blocks legacy intervals crossing midnight using their actual time range', async () => {
    const first = await service.create(input('midnight-legacy@example.com'));
    const start = base.startOf('day').plus({ hours: 23, minutes: 30 });
    await db.query('UPDATE public.service_bookings SET starts_at=$2,ends_at=$3,slot_number=23 WHERE id=$1', [first.id,start.toJSDate(),start.plus({ hours:1 }).toJSDate()]);
    const midnight = start.plus({ days:1 }).startOf('day');
    const overnight = new BookingsService(db,new ScheduleRules({ timeZone:'UTC',hours:Array(7).fill({ open:'00:00',close:'23:59' }) }));
    const request = { ...input('midnight-new@example.com'),startsAt:midnight.toISO()! };
    await expect(overnight.availability(request)).resolves.toMatchObject({ available:false });
    await expect(overnight.create(request)).rejects.toBeInstanceOf(ConflictException);
    await expect(overnight.create({ ...request,startsAt:midnight.plus({ hours:1 }).toISO()! })).resolves.toHaveProperty('id');
    await overnight.changeStatus(first.id,{ status:'CANCELLED',expectedVersion:1 });
    await expect(overnight.create(request)).resolves.toHaveProperty('id');
  });

  it('returns 404 for a service that does not exist', async () => {
    await expect(service.create(input(
      'missing@example.com', '00000000-0000-4000-8000-000000000099',
    ))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back contact and vehicle inserts when booking insertion fails', async () => {
    await db.query(
      "CREATE FUNCTION public.reject_test_booking() RETURNS trigger LANGUAGE plpgsql " +
      "AS $$ BEGIN RAISE EXCEPTION 'fixture insertion failure'; END; $$",
    );
    await db.query(
      'CREATE TRIGGER reject_test_booking BEFORE INSERT ON public.service_bookings ' +
      'FOR EACH ROW EXECUTE FUNCTION public.reject_test_booking()',
    );
    try {
      await expect(service.create(input('rollback@example.com'))).rejects.toThrow();
      for (const table of ['users', 'booking_vehicles', 'service_bookings']) {
        const [{ count }] = await db.query('SELECT count(*)::int AS count FROM public.' + table + (table === 'users' ? " WHERE role='customer'" : ''));
        expect(count).toBe(0);
      }
      expect((await db.query('SELECT scheduling_version AS version FROM public.users WHERE id=$1', [techA]))[0].version).toBe(0);
      expect((await db.query('SELECT scheduling_version AS version FROM public.service_bays WHERE id=$1', [bayA]))[0].version).toBe(0);
    } finally {
      await db.query('DROP TRIGGER reject_test_booking ON public.service_bookings');
      await db.query('DROP FUNCTION public.reject_test_booking()');
    }
  });

  it('allows only one of two simultaneous confirmations for one resource pair', async () => {
    await db.query('DELETE FROM public.service_bays WHERE id=$1', [bayB]);
    const release = await hold('technicians', techA);
    const pending = Promise.allSettled([
      service.create(input('a@example.com')), service.create(input('b@example.com')),
    ]);
    try { await waitForWaiters('technicians', 2); }
    finally { await release(); await pending; }
    const results = await pending;
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(result => result.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(ConflictException);
    const [technician] = await db.query('SELECT scheduling_version AS version FROM public.users WHERE id=$1', [techA]);
    const [bay] = await db.query('SELECT scheduling_version AS version FROM public.service_bays WHERE id=$1', [bayA]);
    expect(technician.version).toBe(2);
    expect(bay.version).toBe(1);
  });

  it('rolls back the technician claim when a bay version changes before its conditional update', async () => {
    const release = await hold('service_bays', bayA);
    const pending = db.transaction(manager => claimResources(manager, { technicianId: techA, bayId: bayA }));
    const settled = Promise.allSettled([pending]);
    try { await waitForWaiters('service_bays', 1); }
    finally { await release(); await settled; }
    await expect(pending).rejects.toBeInstanceOf(CandidateChanged);
    expect((await db.query('SELECT scheduling_version AS version FROM public.users WHERE id=$1', [techA]))[0].version).toBe(0);
    expect((await db.query('SELECT scheduling_version AS version FROM public.service_bays WHERE id=$1', [bayA]))[0].version).toBe(1);
  });

  it('protects a shared bay even when technicians differ', async () => {
    await db.query('DELETE FROM public.service_bays WHERE id=$1', [bayB]);
    const release = await hold('service_bays', bayA);
    const pending = Promise.allSettled([
      service.create(input('a@example.com', oil)),
      service.create(input('b@example.com', inspection)),
    ]);
    try { await waitForWaiters('service_bays', 2); }
    finally { await release(); await pending; }
    expect((await pending).filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.query('SELECT id FROM public.service_bookings')).toHaveLength(1);
    expect(await db.query('SELECT id FROM public.users WHERE role=\'customer\'')).toHaveLength(1);
  });

  it('retries to a second qualified technician and bay when two customers choose the same hour', async () => {
    await db.query('INSERT INTO public.technician_service_types (technician_id,service_type_id) VALUES ($1,$2)',
      ['00000000-0000-4000-8000-000000000012', oil]);
    const release = await hold('technicians', techA);
    const pending = Promise.allSettled([
      service.create(input('a@example.com')), service.create(input('b@example.com')),
    ]);
    try { await waitForWaiters('technicians', 2); }
    finally { await release(); await pending; }
    expect((await pending).filter(result => result.status === 'fulfilled')).toHaveLength(2);
    const rows = await db.query('SELECT technician_id,service_bay_id FROM public.service_bookings');
    expect(new Set(rows.map((row: { technician_id: string }) => row.technician_id)).size).toBe(2);
    expect(new Set(rows.map((row: { service_bay_id: string }) => row.service_bay_id)).size).toBe(2);
  });

  it('lets unrelated resources complete while another resource is locked', async () => {
    const release = await hold('technicians', techA);
    const pending = Promise.allSettled([service.create(input('waiting@example.com', oil))]);
    try {
      await waitForWaiters('technicians', 1);
      await expect(service.create(input('independent@example.com', inspection), { bayId: bayB }))
        .resolves.toHaveProperty('id');
      expect(await waiterCount('technicians')).toBeGreaterThan(0);
    } finally {
      await release();
      await pending;
    }
    expect((await pending)[0].status).toBe('fulfilled');
  });

  it('retries version conflicts across different hours and dates for the same resources', async () => {
    const release = await hold('technicians', techA);
    const attempts = Promise.allSettled([
      service.create(input('same-hour@example.com')),
      service.create(input('other-hour@example.com', oil, 60)),
    ]);
    try { await waitForWaiters('technicians', 2); }
    finally { await release(); await attempts; }
    expect((await attempts).every(result => result.status === 'fulfilled')).toBe(true);
    await expect(service.create({ ...input('other-date@example.com'), startsAt: base.plus({ days: 1 }).toISO()! }))
      .resolves.toHaveProperty('id');
  });

  it('allows only one winner under competing first bookings', async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => service.create(input(`first${i}@example.com`))));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.query('SELECT id FROM public.service_bookings')).toHaveLength(1);
    expect(await db.query("SELECT id FROM public.users WHERE role='customer'")).toHaveLength(1);
  });

  it('reuses a customer during concurrent confirmations without uniqueness errors', async () => {
    const results = await Promise.all([
      service.create(input('same@example.com', oil)),
      service.create({ ...input(' SAME@EXAMPLE.COM ', inspection), registrationNumber: 'SECOND' }),
    ]);
    expect(results).toHaveLength(2);
    const [{ count }] = await db.query('SELECT count(*)::int AS count FROM public.users WHERE role=\'customer\'');
    expect(count).toBe(1);
  });
});
