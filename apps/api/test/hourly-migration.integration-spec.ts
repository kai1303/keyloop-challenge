import { legacyMigrationRunner } from './legacy-migration-runner.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { HourlySlots1792627200000 } from '../src/database/migrations/1792627200000-hourly-slots.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

it('backfills local slot metadata without changing legacy appointments or associations', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query('TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types');
    await db.transaction(seedCatalog);
    const service = new BookingsService(db, new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill({ open: '09:00', close: '17:00' }) }));
    const created = await service.create({
      name: 'Migration fixture', email: 'migration@example.com', phoneNumber: '+84901234567',
      registrationNumber: 'LEGACY', serviceTypeId: '00000000-0000-4000-8000-000000000001', startsAt: '2030-01-02T10:00:00Z',
    });
    const runner = legacyMigrationRunner(db.createQueryRunner());
    await runner.connect();
    await runner.startTransaction();
    const previousZone = process.env.DEALERSHIP_TIMEZONE;
    try {
      const migration = new HourlySlots1792627200000();
      await migration.down(runner);
      await runner.query("UPDATE public.service_bookings SET starts_at='2030-01-01T23:30:00Z', ends_at='2030-01-02T00:00:00Z' WHERE id=$1", [created.id]);
      await runner.query('UPDATE public.service_types SET duration_minutes=30');
      const before = await runner.query('SELECT * FROM public.service_bookings WHERE id=$1', [created.id]);
      process.env.DEALERSHIP_TIMEZONE = 'Asia/Ho_Chi_Minh';
      await migration.up(runner);
      const after = await runner.query('SELECT *, booking_date::text AS booking_date FROM public.service_bookings WHERE id=$1', [created.id]);
      expect(after[0]).toMatchObject(before[0]);
      expect(after[0].booking_date).toBe('2030-01-02');
      expect(after[0].slot_number).toBe(6);
      expect((await runner.query('SELECT duration_minutes FROM public.service_types')).every((row: { duration_minutes: number }) => row.duration_minutes === 60)).toBe(true);
    } finally {
      if (previousZone === undefined) delete process.env.DEALERSHIP_TIMEZONE;
      else process.env.DEALERSHIP_TIMEZONE = previousZone;
      await runner.rollbackTransaction();
      await runner.release();
    }
  } finally { await db.destroy(); }
});
