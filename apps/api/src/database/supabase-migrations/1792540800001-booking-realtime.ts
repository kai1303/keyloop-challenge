import { readFile } from 'node:fs/promises';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingRealtime1792540800001 implements MigrationInterface {
  name = 'BookingRealtime1792540800001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      await readFile(
        new URL('./booking-realtime.sql', import.meta.url),
        'utf8',
      ),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'DROP TRIGGER IF EXISTS booking_availability_changed ON scheduler.service_bookings',
    );
    await runner.query(
      'DROP FUNCTION IF EXISTS scheduler.broadcast_availability_change()',
    );
  }
}
