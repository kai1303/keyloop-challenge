import { testDatabase } from './database-fixture.js';

describe('public booking tables', () => {
  const db = testDatabase();
  beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
  afterAll(async () => { if (db.isInitialized) await db.destroy(); });

  it('stores technicians as users with their role and removes the separate table', async () => {
    const { seedCatalog } = await import('../src/database/seed.js');
    await db.transaction(seedCatalog);
    expect((await db.query("SELECT id FROM public.users WHERE role='technician' ORDER BY id")).map((row: { id: string }) => row.id)).toEqual(['00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012']);
    expect((await db.query("SELECT to_regclass('public.technicians') AS old"))[0].old).toBeNull();
  });

  it('stores occupancy only in bookings and removes retry and resource claim tables', async () => {
    const rows: { table_name: string }[] = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('booking_requests','resource_slots','service_bays','service_bookings','service_types','technician_service_types','users','booking_vehicles')",
    );
    expect(rows.map(row => row.table_name).sort()).toEqual([
      'booking_vehicles', 'service_bays', 'service_bookings', 'service_types',
      'technician_service_types', 'users',
    ]);
    expect((await db.query("SELECT to_regclass('public.resource_slots') AS obsolete"))[0].obsolete).toBeNull();
    expect((await db.query("SELECT to_regclass('public.booking_requests') AS obsolete"))[0].obsolete).toBeNull();
  });
it('seeds the catalog idempotently', async () => {
  const { seedCatalog } = await import('../src/database/seed.js');
  await db.transaction(seedCatalog);
  await db.transaction(seedCatalog);
  const [{ count }] = await db.query<{ count: string }[]>(
    'SELECT count(*) FROM public.service_types',
  );
  expect(count).toBe('2');
});
  it('stores indexed booking date and hourly slot metadata', async () => {
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='service_bookings'");
    expect(columns.map((row: { column_name: string }) => row.column_name)).toEqual(expect.arrayContaining(['booking_date', 'slot_number']));
    const indexes = await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='booking_day'");
    expect(indexes[0]?.indexdef).toContain('booking_date');
  });
  it('adds versioned admin fields and excludes only cancelled bookings from all occupancy indexes', async () => {
    const columns = await db.query("SELECT column_name,data_type,character_maximum_length,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='service_bookings'");
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ column_name: 'version', data_type: 'integer', column_default: '1' }),
      expect.objectContaining({ column_name: 'cancellation_reason', character_maximum_length: 500 }),
    ]));
    const indexes = await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN ('booking_day','booking_technician_interval','booking_bay_interval')");
    expect(indexes).toHaveLength(3);
    for (const row of indexes) expect(row.indexdef).toContain("status <> 'CANCELLED'");
  });

});
