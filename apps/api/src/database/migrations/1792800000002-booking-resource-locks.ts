import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingResourceLocks1792800000002 implements MigrationInterface {
  name = 'BookingResourceLocks1792800000002';

  async up(runner: QueryRunner): Promise<void> {
    // Stop old booking writers before cutover; bookings retain the complete occupancy history.
    await runner.query(
      "DROP TABLE public.resource_slots; NOTIFY pgrst, 'reload schema';",
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Stop booking writers and restore the verified pre-cutover backup/source, or explicitly re-backfill resource claims before rolling back',
      ),
    );
  }
}
