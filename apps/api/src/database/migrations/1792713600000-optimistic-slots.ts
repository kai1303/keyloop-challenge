import { IANAZone } from 'luxon';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisticSlots1792713600000 implements MigrationInterface {
  name = 'OptimisticSlots1792713600000';

  async up(runner: QueryRunner): Promise<void> {
    const zone = process.env.DEALERSHIP_TIMEZONE;
    if (!zone || !IANAZone.isValidZone(zone)) throw new Error('Set DEALERSHIP_TIMEZONE before migrating optimistic slots');
    await runner.query(`CREATE TABLE scheduler.resource_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      technician_id uuid REFERENCES scheduler.technicians(id),
      service_bay_id uuid REFERENCES scheduler.service_bays(id),
      slot_start timestamptz NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      booking_count integer NOT NULL DEFAULT 0 CHECK (booking_count >= 0),
      CHECK (num_nonnulls(technician_id, service_bay_id) = 1),
      UNIQUE (technician_id, slot_start), UNIQUE (service_bay_id, slot_start)
    )`);
    for (const column of ['technician_id', 'service_bay_id']) {
      await runner.query(
        'INSERT INTO scheduler.resource_slots (' + column + ', slot_start, booking_count) ' +
        'SELECT b.' + column + ', hour, count(*)::int FROM scheduler.service_bookings b ' +
        "CROSS JOIN LATERAL generate_series(b.starts_at - (b.starts_at AT TIME ZONE $1 - date_trunc('hour', b.starts_at AT TIME ZONE $1)), " +
        "b.ends_at - interval '1 microsecond', interval '1 hour') hour " +
        "WHERE b.status <> 'CANCELLED' GROUP BY b." + column + ', hour', [zone],
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE scheduler.resource_slots');
  }
}
