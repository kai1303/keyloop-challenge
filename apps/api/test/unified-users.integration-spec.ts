import { BookingResourceLocks1792800000002 } from '../src/database/migrations/1792800000002-booking-resource-locks.js';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { DataSource } from 'typeorm';
import { createStaffAuth } from '../src/auth/auth.config.js';
import { StaffAuthService } from '../src/auth/staff-auth.service.js';
import { UnifiedUsers1792800000001 } from '../src/database/migrations/1792800000001-unified-users.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { testDatabase } from './database-fixture.js';

it('merges matching identities, preserves credentials/sessions/assignments, and supports text technician IDs', async () => {
  const control = testDatabase();
  await control.initialize();
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.pathname = '/scheduler_users_upgrade_test';
  await control.query('CREATE DATABASE scheduler_users_upgrade_test');
  const migrations = (control.options.migrations as Function[]).filter(
    (migration) => migration !== UnifiedUsers1792800000001 && migration !== BookingResourceLocks1792800000002,
  );
  const options = control.options;
  if (options.type !== 'postgres') throw new Error('Expected PostgreSQL fixture');
  const db = new DataSource({
    ...options,
    type: 'postgres',
    url: url.toString(),
    migrations,
  });
  const pool = new Pool({
    connectionString: url.toString(),
    options: '-c search_path=public',
    max: 2,
  });
  const password = 'retained-secret-123';
  vi.stubEnv('DATABASE_URL', url.toString());
  vi.stubEnv(
    'BETTER_AUTH_SECRET',
    'isolated-users-migration-secret-more-than-32-characters',
  );
  vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:3006');
  const staff = new StaffAuthService();
  try {
    await db.initialize();
    await db.runMigrations();
    await db.query(`
      INSERT INTO public.users (id,name,email,phone_number) VALUES
        ('00000000-0000-4000-8000-000000000101','Customer Name','same@upgrade.test','+84901234567'),
        ('00000000-0000-4000-8000-000000000102','Customer Only','customer@upgrade.test','+84901234568');
      INSERT INTO public.technicians VALUES ('00000000-0000-4000-8000-000000000011','Legacy Technician');
      INSERT INTO public.service_bays VALUES ('00000000-0000-4000-8000-000000000021','Bay');
      INSERT INTO public.service_types VALUES ('00000000-0000-4000-8000-000000000001','Oil',60);
      INSERT INTO public.technician_service_types VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001');
      INSERT INTO public.booking_vehicles (id,user_id,registration_number) VALUES ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000101','KEEP');
      INSERT INTO public.service_bookings (id,user_id,vehicle_id,service_type_id,technician_id,service_bay_id,starts_at,ends_at,submitted_name,submitted_email,submitted_phone_number,booking_date,slot_number)
        VALUES ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021','2031-01-02T10:00:00Z','2031-01-02T11:00:00Z','Submitted Guest','same@upgrade.test','+84901234567','2031-01-02',10);
      INSERT INTO public.resource_slots (technician_id,slot_start,booking_count,version) VALUES ('00000000-0000-4000-8000-000000000011','2031-01-02T10:00:00Z',1,7);
    `);
    const oldAuth = betterAuth({
      ...createStaffAuth(pool).options,
      user: { modelName: 'user' },
    });
    const created = await oldAuth.api.createUser({
      body: {
        name: 'Staff Name',
        email: 'same@upgrade.test',
        password,
        role: 'technician',
      },
    });
    const signed = await oldAuth.api.signInEmail({
      body: { email: 'same@upgrade.test', password },
    });
    const [session] = await db.query(
      'SELECT * FROM public.session WHERE "userId"=$1',
      [created.user.id],
    );
    expect(session.token).toBe(signed.token);
    const now = Math.floor(Date.now() / 1000);
    const { token } = await oldAuth.api.signJWT({
      body: {
        payload: {
          sub: created.user.id,
          sid: session.id,
          role: 'technician',
          iss: oldAuth.options.baseURL,
          aud: 'keyloop-api',
          iat: now,
          exp: now + 300,
        },
      },
    });
    const accounts = await db.query('SELECT * FROM public.account ORDER BY id');
    const bookings = await db.query('SELECT * FROM public.service_bookings');
    const slots = await db.query('SELECT * FROM public.resource_slots');
    const qualifications = await db.query(
      'SELECT * FROM public.technician_service_types',
    );
    await expect(
      db.transaction(async (manager) => {
        await manager.query(
          "INSERT INTO public.users (id,name,email,phone_number) VALUES ('00000000-0000-4000-8000-000000000011','Collision','collision@upgrade.test','+84901234567')",
        );
        await new UnifiedUsers1792800000001().up(manager.queryRunner!);
      }),
    ).rejects.toThrow('Technician/user ID collision');
    expect(
      (
        await db.query(
          "SELECT to_regclass('public.technicians') IS NOT NULL AS retained",
        )
      )[0].retained,
    ).toBe(true);
    await db.transaction((manager) =>
      new UnifiedUsers1792800000001().up(manager.queryRunner!),
    );
    expect(await db.query('SELECT * FROM public.account ORDER BY id')).toEqual(
      accounts,
    );
    expect(
      await db.query('SELECT * FROM public.session WHERE id=$1', [session.id]),
    ).toEqual([session]);
    expect(await db.query('SELECT * FROM public.service_bookings')).toEqual([
      { ...bookings[0], user_id: created.user.id },
    ]);
    expect(await db.query('SELECT * FROM public.resource_slots')).toEqual(
      slots,
    );
    expect(
      await db.query('SELECT * FROM public.technician_service_types'),
    ).toEqual(qualifications);
    expect(
      (
        await db.query(
          "SELECT to_regclass('public.technicians') AS technicians,to_regclass('public.\"user\"') AS staff",
        )
      )[0],
    ).toEqual({ technicians: null, staff: null });
    expect(
      (
        await db.query(
          'SELECT id,name,role,phone_number FROM public.users WHERE email=$1',
          ['same@upgrade.test'],
        )
      )[0],
    ).toEqual({
      id: created.user.id,
      name: 'Staff Name',
      role: 'technician',
      phone_number: '+84901234567',
    });
    expect(
      (
        await db.query(
          "SELECT role,email FROM public.users WHERE id='00000000-0000-4000-8000-000000000011'",
        )
      )[0],
    ).toEqual({ role: 'technician', email: null });
    expect(
      (
        await db.query(
          "SELECT role FROM public.users WHERE email='customer@upgrade.test'",
        )
      )[0].role,
    ).toBe('customer');
    expect((await staff.authenticate(token)).id).toBe(created.user.id);
    await expect(
      staff
        .instance()
        .api.signInEmail({ body: { email: 'same@upgrade.test', password } }),
    ).resolves.toMatchObject({ user: { id: created.user.id } });
    await db.query(
      'INSERT INTO public.technician_service_types VALUES ($1,$2)',
      [created.user.id, '00000000-0000-4000-8000-000000000001'],
    );
    const service = new BookingsService(
      db,
      new ScheduleRules({
        timeZone: 'UTC',
        hours: Array(7).fill({ open: '09:00', close: '17:00' }),
      }),
    );
    const input = {
      name: 'Guest Cannot Rename Staff',
      email: 'same@upgrade.test',
      phoneNumber: '+84909999999',
      registrationNumber: 'NEW',
      serviceTypeId: '00000000-0000-4000-8000-000000000001',
      startsAt: '2031-01-02T12:00:00Z',
      technicianId: created.user.id,
    };
    await expect(service.createAdmin(input)).resolves.toMatchObject({
      technicianId: created.user.id,
    });
    expect(
      (
        await db.query(
          'SELECT name,role,phone_number FROM public.users WHERE id=$1',
          [created.user.id],
        )
      )[0],
    ).toEqual({
      name: 'Staff Name',
      role: 'technician',
      phone_number: '+84901234567',
    });
    expect(await db.query('SELECT * FROM public.account ORDER BY id')).toEqual(
      accounts,
    );
    await db.query('UPDATE public.users SET banned=true WHERE id=$1', [
      created.user.id,
    ]);
    await expect(
      service.createAdmin({ ...input, startsAt: '2031-01-02T13:00:00Z' }),
    ).rejects.toMatchObject({ status: 409 });
    await db.query(
      "UPDATE public.users SET banned=false,role='customer' WHERE id=$1",
      [created.user.id],
    );
    await expect(staff.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.createAdmin({ ...input, startsAt: '2031-01-02T13:00:00Z' }),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    await staff.onModuleDestroy();
    await pool.end();
    if (db.isInitialized) await db.destroy();
    await control.query('DROP DATABASE scheduler_users_upgrade_test');
    await control.destroy();
    vi.unstubAllEnvs();
  }
}, 30000);
