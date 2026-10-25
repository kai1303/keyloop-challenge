import { OptimisticResourceVersions1792886400000 } from '../src/database/migrations/1792886400000-optimistic-resource-versions.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

it('adds resource versions without changing profiles, bays or access privileges', async () => {
  const db = testDatabase();
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query('TRUNCATE public.session,public.account,public.booking_requests,public.service_bookings,public.booking_vehicles,public.users,public.technician_service_types,public.service_bays,public.service_types');
    await db.transaction(seedCatalog);
    const migration = new OptimisticResourceVersions1792886400000();
    await db.transaction(manager => migration.down(manager.queryRunner!));
    const before = await db.query('SELECT to_jsonb(u) AS row FROM public.users u ORDER BY id');
    const bays = await db.query('SELECT to_jsonb(b) AS row FROM public.service_bays b ORDER BY id');
    const permissions = () => db.query("SELECT relname,relrowsecurity,relacl FROM pg_class WHERE oid IN ('public.users'::regclass,'public.service_bays'::regclass) ORDER BY relname");
    const access = await permissions();
    await db.transaction(manager => migration.up(manager.queryRunner!));
    expect(await db.query("SELECT to_jsonb(u)-'scheduling_version' AS row FROM public.users u ORDER BY id")).toEqual(before);
    expect(await db.query("SELECT to_jsonb(b)-'scheduling_version' AS row FROM public.service_bays b ORDER BY id")).toEqual(bays);
    expect(await permissions()).toEqual(access);
    const versions = await db.query('SELECT scheduling_version AS version FROM public.users UNION ALL SELECT scheduling_version FROM public.service_bays');
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((row: { version: number }) => row.version === 0)).toBe(true);
    await expect(db.query('UPDATE public.service_bays SET scheduling_version=NULL')).rejects.toMatchObject({ driverError: { code: '23502' } });
  } finally { await db.destroy(); }
});
