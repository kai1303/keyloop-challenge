import { readFile } from 'node:fs/promises';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialScheduler1792540800000 implements MigrationInterface {
  name = 'InitialScheduler1792540800000';

  async up(runner: QueryRunner): Promise<void> {
    const sql = await readFile(
      new URL('./initial-schema.sql', import.meta.url),
      'utf8',
    );
    await runner.query(sql);
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of [
      'service_bookings',
      'technician_service_types',
      'vehicles',
      'technicians',
      'service_bays',
      'service_types',
      'users',
    ]) {
      await runner.query('DROP TABLE scheduler.' + table);
    }
    await runner.query('DROP SCHEMA scheduler');
  }
}
