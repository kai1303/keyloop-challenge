import { PrivateMigrationHistory1792627200004 } from '../src/database/supabase-migrations/1792627200004-private-migration-history.js';
import { testDatabase } from './database-fixture.js';

it('removes browser access to migration history without changing its records', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`
        DO $roles$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
            CREATE ROLE anon NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
            CREATE ROLE authenticated NOLOGIN;
          END IF;
        END; $roles$;
        GRANT ALL ON public.appointment_scheduler_migrations TO PUBLIC, anon, authenticated;
        GRANT ALL ON SEQUENCE public.appointment_scheduler_migrations_id_seq TO PUBLIC, anon, authenticated;
      `);
      const before = await runner.query(
        'SELECT * FROM public.appointment_scheduler_migrations ORDER BY id',
      );
      const migration = new PrivateMigrationHistory1792627200004();
      await migration.up(runner);
      await migration.up(runner);
      for (const role of ['anon', 'authenticated']) {
        expect(
          await runner.query(
            `SELECT has_table_privilege($1, 'public.appointment_scheduler_migrations', 'SELECT,INSERT,UPDATE,DELETE') AS table_access,
              has_sequence_privilege($1, 'public.appointment_scheduler_migrations_id_seq', 'USAGE,SELECT,UPDATE') AS sequence_access`,
            [role],
          ),
        ).toEqual([{ table_access: false, sequence_access: false }]);
      }
      expect(
        await runner.query(
          'SELECT * FROM public.appointment_scheduler_migrations ORDER BY id',
        ),
      ).toEqual(before);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  } finally {
    await db.destroy();
  }
});
