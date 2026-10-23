import { testDatabase } from './database-fixture.js';
import { seedCatalog } from '../src/database/seed.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { StaffAuth1792627200005 } from '../src/database/supabase-migrations/1792627200005-staff-auth.js';
import { PublicSchema1792800000000 } from '../src/database/migrations/1792800000000-public-schema.js';

it('moves existing bookings and staff to public without changing rows, identities, or inventory', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query('TRUNCATE public.session, public.account, public.booking_requests, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types');
    await db.transaction(seedCatalog);
    const service = new BookingsService(
      db,
      new ScheduleRules({
        timeZone: 'UTC',
        hours: Array(7).fill({ open: '09:00', close: '17:00' }),
      }),
    );
    await service.create({
      name: 'Move fixture',
      email: 'move@schema.test',
      phoneNumber: '+84901234567',
      registrationNumber: 'MOVE',
      serviceTypeId: '00000000-0000-4000-8000-000000000001',
      startsAt: '2031-01-02T10:00:00Z',
    });
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const tables = [
        'users',
        'booking_vehicles',
        'service_types',
        'service_bays',
        'technician_service_types',
        'service_bookings',
        'booking_requests',
      ];
      const before = new Map<string, unknown>();
      for (const table of tables)
        before.set(
          table,
          await runner.query(
            `SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`,
          ),
        );
      const oid = (
        await runner.query(
          "SELECT 'public.service_bookings'::regclass::oid AS oid",
        )
      )[0];
      await runner.query('CREATE SCHEMA scheduler');
      for (const table of tables)
        await runner.query(`ALTER TABLE public.${table} SET SCHEMA scheduler`);
      await runner.query(
        'ALTER TABLE scheduler.booking_vehicles RENAME TO vehicles',
      );
      await runner.query(
        'ALTER INDEX scheduler.booking_vehicles_pkey RENAME TO vehicles_pkey',
      );
      await runner.query(
        'ALTER INDEX scheduler.booking_vehicles_user_id_registration_number_key RENAME TO vehicles_user_id_registration_number_key',
      );
      await runner.query(
        'CREATE TABLE public.vehicles (id integer PRIMARY KEY, registration text)',
      );
      await runner.query("INSERT INTO public.vehicles VALUES (1,'KEEP-STOCK')");
      await runner.query('DROP TABLE public.session,public.account,public.verification,public.jwks,public."rateLimit"');
      await new StaffAuth1792627200005().up(runner);
      await runner.query(
        `INSERT INTO staff_auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role) VALUES ('retained','Staff','retained@schema.test',true,now(),now(),'admin')`,
      );
      await runner.query(`DO $roles$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      END $roles$;
      GRANT ALL ON ALL TABLES IN SCHEMA scheduler, staff_auth TO PUBLIC, anon, authenticated;
      GRANT CREATE ON SCHEMA public TO PUBLIC, anon, authenticated;`);
      await new PublicSchema1792800000000().up(runner);
      await new PublicSchema1792800000000().up(runner);
      for (const table of tables)
        expect(
          await runner.query(
            `SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`,
          ),
        ).toEqual(before.get(table));
      expect(
        (
          await runner.query(
            "SELECT 'public.service_bookings'::regclass::oid AS oid",
          )
        )[0],
      ).toEqual(oid);
      expect(await runner.query('SELECT * FROM public.vehicles')).toEqual([
        { id: 1, registration: 'KEEP-STOCK' },
      ]);
      expect(await runner.query('SELECT id FROM public."user"')).toEqual([
        { id: 'retained' },
      ]);
      expect(
        await runner.query(
          "SELECT nspname FROM pg_namespace WHERE nspname IN ('scheduler','staff_auth')",
        ),
      ).toEqual([]);
      for (const role of ['anon', 'authenticated']) {
        expect(
          (
            await runner.query(
              "SELECT has_schema_privilege($1,'public','CREATE') AS allowed",
              [role],
            )
          )[0].allowed,
        ).toBe(false);
        for (const table of [
          ...tables,
          'user',
          'session',
          'account',
          'verification',
          'jwks',
          'rateLimit',
        ]) {
          expect(
            (
              await runner.query(
                "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS allowed",
                [role, `public."${table}"`],
              )
            )[0].allowed,
          ).toBe(false);
          expect(
            (
              await runner.query(
                'SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',
                [`public."${table}"`],
              )
            )[0].relrowsecurity,
          ).toBe(true);
        }
      }
      await expect(
        runner.query(
          "INSERT INTO public.booking_vehicles (user_id,registration_number) VALUES (gen_random_uuid()::text,'NO-CUSTOMER')",
        ),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  } finally {
    await db.destroy();
  }
});

it('rolls back a schema move when a destination table conflicts', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    await expect(
      db.transaction(async (manager) => {
        await manager.query('CREATE SCHEMA scheduler');
        await manager.query(
          'CREATE TABLE scheduler.users (id integer PRIMARY KEY)',
        );
        await manager.query('INSERT INTO scheduler.users VALUES (42)');
        await new PublicSchema1792800000000().up(manager.queryRunner!);
      }),
    ).rejects.toMatchObject({ driverError: { code: '42P07' } });
    expect(
      (
        await db.query(
          "SELECT to_regclass('public.users') IS NOT NULL AS retained, to_regnamespace('scheduler') IS NULL AS rolled_back",
        )
      )[0],
    ).toEqual({ retained: true, rolled_back: true });
  } finally {
    await db.destroy();
  }
});
