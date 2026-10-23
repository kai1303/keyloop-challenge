import { readFile } from 'node:fs/promises';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminBookingRealtime1792627200003 implements MigrationInterface {
  name = 'AdminBookingRealtime1792627200003';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      await readFile(
        new URL('./admin-booking-realtime.sql', import.meta.url),
        'utf8',
      ),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const original = await readFile(
      new URL('./booking-realtime.sql', import.meta.url),
      'utf8',
    );
    await runner.query(
      original
        .slice(
          original.indexOf('CREATE FUNCTION'),
          original.indexOf('CREATE TRIGGER'),
        )
        .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'),
    );
  }
}
