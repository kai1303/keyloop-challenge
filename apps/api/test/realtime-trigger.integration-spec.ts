import { legacyMigrationRunner } from './legacy-migration-runner.js';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import { testDatabase } from './database-fixture.js';
import { seedCatalog } from '../src/database/seed.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { AdminBookingRealtime1792627200003 } from '../src/database/supabase-migrations/1792627200003-admin-booking-realtime.js';
import { BookingRealtime1792540800001 } from '../src/database/supabase-migrations/1792540800001-booking-realtime.js';

describe('availability trigger SQL contract', () => {
  const db = testDatabase();
  const migration = new BookingRealtime1792540800001();
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' })),
  });
  const service = new BookingsService(db, rules);
  const date = DateTime.utc().plus({ days: 2 }).startOf('day').plus({ hours: 10 });
  let installedStub = false;
  const input = {
    name: 'Private Guest', email: 'private@example.com', phoneNumber: '+84901234567',
    registrationNumber: 'PRIVATE-REG',
    serviceTypeId: '00000000-0000-4000-8000-000000000001',
    startsAt: date.toISO()!,
  };

  beforeAll(async () => {
    await db.initialize();
    await db.runMigrations();
    await db.transaction(async manager => {
      await manager.query(await readFile(new URL('./realtime-stub.sql', import.meta.url), 'utf8'));
    });
    installedStub = true;
    const runner = legacyMigrationRunner(db.createQueryRunner());
    await runner.connect();
    await runner.startTransaction();
    try {
      await migration.up(runner);
      await new AdminBookingRealtime1792627200003().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally { await runner.release(); }
  });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE public.session, public.account, public.service_bookings, public.booking_vehicles, public.users, ' +
      'public.technician_service_types, ' +
      'public.service_bays, public.service_types, realtime.test_outbox',
    );
    await db.transaction(seedCatalog);
  });
  afterAll(async () => {
    if (!db.isInitialized) return;
    if (!installedStub) { await db.destroy(); return; }
    const runner = legacyMigrationRunner(db.createQueryRunner());
    await runner.connect();
    try {
      await migration.down(runner);
      await runner.query('DROP FUNCTION realtime.send(jsonb,text,text,boolean)');
      await runner.query('DROP TABLE realtime.test_outbox');
      await runner.query('DROP SCHEMA realtime');
    } finally {
      await runner.release();
      await db.destroy();
    }
  });

  it('publishes exactly the public date-only event', async () => {
    await service.create(input);
    const messages = await db.query('SELECT payload,event,topic,private FROM realtime.test_outbox');
    expect(messages).toEqual([{
      payload: { date: date.toISODate() },
      event: 'availability_changed',
      topic: 'availability:' + date.toISODate(),
      private: false,
    }]);
    const encoded = JSON.stringify(messages);
    for (const secret of [input.name, input.email, input.phoneNumber, input.registrationNumber]) {
      expect(encoded).not.toContain(secret);
    }
  });

  it('rolls back the trigger message with the booking insertion', async () => {
    const first = await service.create(input);
    await db.query('TRUNCATE realtime.test_outbox');
    await expect(db.transaction(async manager => {
      await manager.query("SELECT set_config('scheduler.timezone', 'UTC', true)");
      await manager.query(
        'INSERT INTO public.service_bookings ' +
        '(user_id,vehicle_id,service_type_id,technician_id,service_bay_id,starts_at,ends_at,' +
        'submitted_name,submitted_email,submitted_phone_number,booking_date,slot_number) ' +
        "SELECT user_id,vehicle_id,service_type_id,technician_id,service_bay_id,starts_at+interval '1 day'," +
        "ends_at+interval '1 day',submitted_name,submitted_email,submitted_phone_number,booking_date+1,slot_number " +
        'FROM public.service_bookings WHERE id=$1', [first.id],
      );
      throw new Error('rollback fixture');
    })).rejects.toThrow('rollback fixture');
    expect(await db.query('SELECT * FROM realtime.test_outbox')).toHaveLength(0);
    expect(await db.query('SELECT id FROM public.service_bookings')).toHaveLength(1);
  });

  it('invalidates the old and new local dates when a booking is moved', async () => {
    const first = await service.create(input);
    await db.query('TRUNCATE realtime.test_outbox');
    await service.reschedule(first.id, { startsAt: date.plus({ days: 1 }).toISO()!, expectedVersion: 1 });
    const messages = await db.query('SELECT payload FROM realtime.test_outbox ORDER BY topic');
    expect(messages.map((row: { payload: { date: string } }) => row.payload.date)).toEqual([
      date.toISODate(), date.plus({ days: 1 }).toISODate(),
    ]);
  });
  it('invalidates for every status change, including completion and cancellation, with only the date', async () => {
    const first = await service.createAdmin(input);
    for (const [status, expectedVersion] of [['IN_SERVICE', 1], ['COMPLETED', 2]] as const) {
      await db.query('TRUNCATE realtime.test_outbox');
      await service.changeStatus(first.id, { status, expectedVersion });
      expect(await db.query('SELECT payload,event,topic,private FROM realtime.test_outbox')).toEqual([{
        payload: { date: date.toISODate() }, event: 'availability_changed',
        topic: 'availability:' + date.toISODate(), private: false,
      }]);
    }
    const other = await service.createAdmin({ ...input, email: 'cancel@example.com', startsAt: date.plus({ hours: 1 }).toISO()! });
    await db.query('TRUNCATE realtime.test_outbox');
    await service.changeStatus(other.id, { status: 'CANCELLED', expectedVersion: 1, cancellationReason: 'Private cancellation reason' });
    expect(await db.query('SELECT payload FROM realtime.test_outbox')).toEqual([{ payload: { date: date.toISODate() } }]);
  });

});
