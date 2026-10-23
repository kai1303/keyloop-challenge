import { BookingResourceLocks1792800000002 } from '../src/database/migrations/1792800000002-booking-resource-locks.js';
import { legacyMigrationRunner } from './legacy-migration-runner.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { OptimisticSlots1792713600000 } from '../src/database/migrations/1792713600000-optimistic-slots.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

it('preserves historical backfill and bookings when removing claims, including cancellation', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query('TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types');
    await db.transaction(seedCatalog);
    const service = new BookingsService(db, new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill({ open: '09:00', close: '17:00' }) }));
    const input = { name: 'Legacy Guest', phoneNumber: '+84901234567', serviceTypeId: '00000000-0000-4000-8000-000000000001' };
    const first = await service.create({ ...input, email: 'legacy1@example.com', registrationNumber: 'LEGACY1', startsAt: '2030-01-02T09:00:00Z' });
    const second = await service.create({ ...input, email: 'legacy2@example.com', registrationNumber: 'LEGACY2', startsAt: '2030-01-02T10:00:00Z' });
    // Offline fixture editing simulates existing data before the new migration.
    await db.query("UPDATE public.service_bookings SET starts_at=starts_at+interval '15 minutes',ends_at=ends_at+interval '15 minutes'");
    const before = await db.query('SELECT * FROM public.service_bookings ORDER BY id');
    const runner = legacyMigrationRunner(db.createQueryRunner());
    await runner.connect();
    try {
      const migration = new OptimisticSlots1792713600000();
      await migration.up(runner);
    } finally { await runner.release(); }
    expect(await db.query('SELECT * FROM public.service_bookings ORDER BY id')).toEqual(before);
    await expect(db.query('INSERT INTO public.resource_slots (slot_start) VALUES (now())')).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(db.query("INSERT INTO public.resource_slots (technician_id,slot_start) VALUES ('00000000-0000-4000-8000-000000000099',now())")).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(db.query('INSERT INTO public.resource_slots (technician_id,slot_start) SELECT technician_id,slot_start FROM public.resource_slots WHERE technician_id IS NOT NULL LIMIT 1')).rejects.toMatchObject({ driverError: { code: '23505' } });
    const shared = () => db.query<{ booking_count: number }[]>("SELECT booking_count FROM public.resource_slots WHERE slot_start='2030-01-02T10:00:00Z'");
    expect(await shared()).toEqual([{ booking_count: 2 }, { booking_count: 2 }]);
    await db.transaction(manager => new BookingResourceLocks1792800000002().up(manager.queryRunner!));
    expect(await db.query('SELECT * FROM public.service_bookings ORDER BY id')).toEqual(before);
    await service.changeStatus(first.id, { expectedVersion: 1, status: 'CANCELLED' });
    expect(await service.availability({ serviceTypeId: input.serviceTypeId, startsAt: '2030-01-02T10:00:00Z' })).toMatchObject({ available: false });
    await service.changeStatus(second.id, { expectedVersion: 1, status: 'CANCELLED' });
    expect(await service.create({ ...input, email: 'replacement@example.com', registrationNumber: 'REPLACEMENT', startsAt: '2030-01-02T10:00:00Z' })).toHaveProperty('id');
  } finally { await db.query('DROP TABLE IF EXISTS public.resource_slots'); await db.destroy(); }
});

it('preserves legacy intervals across a half-hour timezone fallback after removing claims', async () => {
  const db = testDatabase();
  const previousZone = process.env.DEALERSHIP_TIMEZONE;
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query('TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types');
    await db.transaction(seedCatalog);
    const hours = Array(7).fill({ open: '00:00', close: '23:59' });
    const service = new BookingsService(db, new ScheduleRules({ timeZone: 'UTC', hours }));
    const booking = await service.create({ name: 'Fallback Guest', phoneNumber: '+84901234567', serviceTypeId: '00000000-0000-4000-8000-000000000001', email: 'fallback@example.com', registrationNumber: 'FALLBACK', startsAt: '2030-01-02T09:00:00Z' });
    await db.query("UPDATE public.service_bookings SET starts_at=$2, ends_at=$2::timestamptz+interval '1 hour', booking_date='2030-04-07', slot_number=1 WHERE id=$1", [booking.id, '2030-04-07T01:45:00+10:30']);
    const before = await db.query('SELECT * FROM public.service_bookings WHERE id=$1', [booking.id]);
    process.env.DEALERSHIP_TIMEZONE = 'Australia/Lord_Howe';
    const runner = legacyMigrationRunner(db.createQueryRunner());
    await runner.connect();
    try {
      const migration = new OptimisticSlots1792713600000();
      await migration.up(runner);
    } finally { await runner.release(); }
    expect(await db.query('SELECT * FROM public.service_bookings WHERE id=$1', [booking.id])).toEqual(before);
    const slots = () => db.query<{ start: Date; count: number }[]>('SELECT slot_start AS start, booking_count AS count FROM public.resource_slots ORDER BY slot_start, id');
    const migrated = await slots();
    expect(migrated.map(slot => slot.start.toISOString())).toEqual([
      '2030-04-06T14:30:00.000Z', '2030-04-06T14:30:00.000Z',
      '2030-04-06T15:30:00.000Z', '2030-04-06T15:30:00.000Z',
    ]);
    expect(migrated.every(slot => slot.count === 1)).toBe(true);
    await db.transaction(manager => new BookingResourceLocks1792800000002().up(manager.queryRunner!));
    const local = new BookingsService(db, new ScheduleRules({ timeZone: 'Australia/Lord_Howe', hours }));
    await expect(local.changeStatus(booking.id, { expectedVersion: 1, status: 'CANCELLED' })).resolves.toMatchObject({ status: 'CANCELLED', version: 2 });
    expect((await db.query("SELECT to_regclass('public.resource_slots') AS old"))[0].old).toBeNull();
  } finally {
    if (previousZone === undefined) delete process.env.DEALERSHIP_TIMEZONE;
    else process.env.DEALERSHIP_TIMEZONE = previousZone;
    await db.query('DROP TABLE IF EXISTS public.resource_slots');
    await db.destroy();
  }
});
