import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminBookings1792627200002 implements MigrationInterface {
  name = 'AdminBookings1792627200002';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE scheduler.service_bookings DROP CONSTRAINT service_bookings_status_check, ' +
        "ADD CONSTRAINT service_bookings_status_check CHECK (status IN ('CONFIRMED','IN_SERVICE','COMPLETED','CANCELLED')), " +
        'ADD COLUMN cancellation_reason varchar(500), ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0)',
    );
    for (const name of [
      'booking_technician_interval',
      'booking_bay_interval',
      'booking_day',
    ]) {
      await runner.query('DROP INDEX scheduler.' + name);
    }
    await runner.query(
      "CREATE INDEX booking_technician_interval ON scheduler.service_bookings (technician_id, starts_at, ends_at) WHERE status <> 'CANCELLED'",
    );
    await runner.query(
      "CREATE INDEX booking_bay_interval ON scheduler.service_bookings (service_bay_id, starts_at, ends_at) WHERE status <> 'CANCELLED'",
    );
    await runner.query(
      "CREATE INDEX booking_day ON scheduler.service_bookings (booking_date) WHERE status <> 'CANCELLED'",
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    // Refuse rollback if it would discard the meaning of an existing workflow status.
    await runner.query(
      'ALTER TABLE scheduler.service_bookings DROP CONSTRAINT service_bookings_status_check, ' +
        "ADD CONSTRAINT service_bookings_status_check CHECK (status = 'CONFIRMED')",
    );
    for (const name of [
      'booking_technician_interval',
      'booking_bay_interval',
      'booking_day',
    ]) {
      await runner.query('DROP INDEX scheduler.' + name);
    }
    await runner.query(
      "CREATE INDEX booking_technician_interval ON scheduler.service_bookings (technician_id, starts_at, ends_at) WHERE status = 'CONFIRMED'",
    );
    await runner.query(
      "CREATE INDEX booking_bay_interval ON scheduler.service_bookings (service_bay_id, starts_at, ends_at) WHERE status = 'CONFIRMED'",
    );
    await runner.query(
      "CREATE INDEX booking_day ON scheduler.service_bookings (booking_date) WHERE status = 'CONFIRMED'",
    );
    await runner.query(
      'ALTER TABLE scheduler.service_bookings DROP COLUMN cancellation_reason, DROP COLUMN version',
    );
  }
}
