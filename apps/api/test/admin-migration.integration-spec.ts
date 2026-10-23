import { legacyMigrationRunner } from './legacy-migration-runner.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { AdminBookings1792627200002 } from '../src/database/migrations/1792627200002-admin-bookings.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

it('upgrades existing bookings without changing their interval, contacts, associations or slot metadata', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query('TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types');
    await db.transaction(seedCatalog);
    const service = new BookingsService(db, new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill({ open: '09:00', close: '17:00' }) }));
    const booking = await service.create({ name: 'Migration Guest', email: 'adminmigration@example.com', phoneNumber: '+84901234567', registrationNumber: 'MIGRATION', serviceTypeId: '00000000-0000-4000-8000-000000000001', startsAt: '2030-01-02T10:00:00Z' });
    const runner = legacyMigrationRunner(db.createQueryRunner());
    await runner.connect(); await runner.startTransaction();
    try {
      const migration = new AdminBookings1792627200002();
      await migration.down(runner);
      await runner.query("UPDATE public.service_bookings SET ends_at=ends_at+interval '15 minutes' WHERE id=$1", [booking.id]);
      const [before] = await runner.query('SELECT * FROM public.service_bookings WHERE id=$1', [booking.id]);
      await migration.up(runner);
      const [after] = await runner.query('SELECT * FROM public.service_bookings WHERE id=$1', [booking.id]);
      expect(after).toMatchObject({ ...before, cancellation_reason: null, version: 1 });
      await expect(runner.query('UPDATE public.service_bookings SET version=0 WHERE id=$1', [booking.id])).rejects.toMatchObject({ driverError: { code: '23514' } });
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  } finally { await db.destroy(); }
});
