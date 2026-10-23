import { IANAZone } from 'luxon';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class HourlySlots1792627200000 implements MigrationInterface {
  name = 'HourlySlots1792627200000';

  async up(runner: QueryRunner): Promise<void> {
    const zone = process.env.DEALERSHIP_TIMEZONE;
    if (!zone || !IANAZone.isValidZone(zone))
      throw new Error('Set DEALERSHIP_TIMEZONE before migrating hourly slots');
    await runner.query("SELECT set_config('scheduler.timezone', $1, true)", [
      zone,
    ]);
    await runner.query(
      'ALTER TABLE scheduler.service_bookings ADD COLUMN booking_date date, ADD COLUMN slot_number smallint',
    );
    await runner.query(
      'UPDATE scheduler.service_bookings SET booking_date = (starts_at AT TIME ZONE $1)::date, ' +
        'slot_number = extract(hour FROM starts_at AT TIME ZONE $1)::int',
      [zone],
    );
    await runner.query(
      'ALTER TABLE scheduler.service_bookings ALTER COLUMN booking_date SET NOT NULL, ' +
        'ALTER COLUMN slot_number SET NOT NULL, ADD CONSTRAINT booking_slot_number CHECK (slot_number BETWEEN 0 AND 23)',
    );
    await runner.query(
      "CREATE INDEX booking_day ON scheduler.service_bookings (booking_date) WHERE status = 'CONFIRMED'",
    );
    await runner.query(
      'CREATE INDEX qualification_service ON scheduler.technician_service_types (service_type_id, technician_id)',
    );
    await runner.query(
      'UPDATE scheduler.service_types SET duration_minutes = 60',
    );
    await runner.query(
      'ALTER TABLE scheduler.service_types ADD CONSTRAINT service_duration_hour CHECK (duration_minutes = 60)',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE scheduler.service_types DROP CONSTRAINT service_duration_hour',
    );
    await runner.query('DROP INDEX scheduler.qualification_service');
    await runner.query('DROP INDEX scheduler.booking_day');
    await runner.query(
      'ALTER TABLE scheduler.service_bookings DROP COLUMN booking_date, DROP COLUMN slot_number',
    );
    // Original catalog durations cannot be inferred after services have used the hourly policy.
  }
}
