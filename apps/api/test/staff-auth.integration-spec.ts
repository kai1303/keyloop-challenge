import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { decodeJwt } from 'jose';
import { testDatabase } from './database-fixture.js';
import { AppModule } from '../src/app.module.js';
import { Database } from '../src/database/database.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { LeadsService } from '../src/leads/leads.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { StaffAuthService } from '../src/auth/staff-auth.service.js';
import { mountStaffAuth } from '../src/auth/mount-auth.js';
import { configureApp } from '../src/configure-app.js';

const db = testDatabase();
let app: NestExpressApplication;
let auth: ReturnType<StaffAuthService['instance']>;
const origin = 'http://127.0.0.1:5173';
const password = '123123123';
const users: Record<
  string,
  { cookie: string; jwt: string; id: string; attributes: string }
> = {};
const booking = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'CONFIRMED',
  version: 1,
};
const bookingService = {
  adminCatalog: async () => ({}),
  listBookings: async () => [booking],
  createAdmin: vi.fn(async () => booking),
  reschedule: vi.fn(async () => booking),
  changeStatus: vi.fn(async () => booking),
  listServices: async () => [],
};

beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  await db.query(
    'TRUNCATE public.session,public.account,public.technician_service_types,public.service_bookings,public.booking_vehicles,public.users',
  );
  vi.stubEnv('DATABASE_URL', process.env.TEST_DATABASE_URL!);
  vi.stubEnv(
    'BETTER_AUTH_SECRET',
    'isolated-auth-signing-secret-more-than-32-characters',
  );
  vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:3006');
  vi.stubEnv('FRONTEND_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Database)
    .useValue(db)
    .overrideProvider(ScheduleRules)
    .useValue({ schedule: { timeZone: 'UTC', hours: Array(7).fill(null) } })
    .overrideProvider(BookingsService)
    .useValue(bookingService)
    .overrideProvider(InventoryService)
    .useValue({ list: async () => ({ vehicles: [] }) })
    .overrideProvider(LeadsService)
    .useValue({ list: async () => [] })
    .overrideProvider(DocumentsService)
    .useValue({ search: async () => ({ documents: [] }) })
    .compile();
  app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  app.useLogger(false);
  configureApp(app);
  mountStaffAuth(app);
  await app.init();
  auth = app.get(StaffAuthService).instance();
  for (const role of ['admin', 'technician']) {
    const created = await auth.api.createUser({
      body: {
        name: role,
        email: role + '@auth.test',
        password,
        role: role as 'admin',
      },
    });
    const signed = await request(app.getHttpServer())
      .post('/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email: role + '@auth.test', password })
      .expect(200);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    const jwt = (
      await request(app.getHttpServer())
        .get('/auth/token')
        .set('Cookie', cookie)
        .expect(200)
    ).body.token;
    users[role] = {
      cookie,
      jwt,
      id: created.user.id,
      attributes: String(signed.headers['set-cookie']),
    };
  }
}, 30000);
afterAll(async () => {
  await app?.close();
  if (db.isInitialized) {
    await db.query(
      'TRUNCATE public.session,public.account,public.technician_service_types,public.service_bookings,public.booking_vehicles,public.users',
    );
    await db.destroy();
  }
  vi.unstubAllEnvs();
});

it('mints a real five-minute JWT, with an HTTP-only renewal cookie and minimal claims', async () => {
  const payload = decodeJwt(users.admin.jwt);
  expect(payload).toMatchObject({
    sub: users.admin.id,
    role: 'admin',
    aud: 'keyloop-api',
    iss: 'http://127.0.0.1:3006',
  });
  expect(typeof payload.sid).toBe('string');
  expect(payload.exp! - payload.iat!).toBe(300);
  expect(payload).not.toHaveProperty('email');
  expect(users.admin.attributes).toContain('HttpOnly');
  expect(users.admin.attributes).toContain('SameSite=Lax');
});
it('provisions existing customer and explicit legacy identities without replacing credentials', async () => {
  const service = app.get(StaffAuthService);
  await db.query(`INSERT INTO public.users (id,name,email,phone_number,role) VALUES
    ('customer-first','Customer','promote@auth.test','+84901234567','customer'),
    ('legacy-profile','Legacy',NULL,NULL,'technician');
    INSERT INTO public.booking_vehicles (user_id,registration_number) VALUES ('customer-first','KEPT');`);
  const input = {
    name: 'Promoted',
    email: 'promote@auth.test',
    password,
    role: 'technician' as const,
  };
  await expect(service.provision(input)).resolves.toMatchObject({
    id: 'customer-first',
    role: 'technician',
  });
  expect(
    await db.query(
      "SELECT user_id FROM public.booking_vehicles WHERE registration_number='KEPT'",
    ),
  ).toEqual([{ user_id: 'customer-first' }]);
  expect(
    (
      await db.query(
        "SELECT phone_number FROM public.users WHERE id='customer-first'",
      )
    )[0].phone_number,
  ).toBe('+84901234567');
  await expect(
    auth.api.signInEmail({ body: { email: input.email, password } }),
  ).resolves.toMatchObject({ user: { id: 'customer-first' } });
  const accounts = await db.query(
    'SELECT * FROM public.account WHERE "userId"=\'customer-first\'',
  );
  const sessions = await db.query(
    'SELECT * FROM public.session WHERE "userId"=\'customer-first\'',
  );
  await expect(
    service.provision({
      ...input,
      password: 'replacement-password',
      role: 'admin',
    }),
  ).rejects.toThrow('already has a login');
  expect(
    await db.query(
      'SELECT * FROM public.account WHERE "userId"=\'customer-first\'',
    ),
  ).toEqual(accounts);
  expect(
    await db.query(
      'SELECT * FROM public.session WHERE "userId"=\'customer-first\'',
    ),
  ).toEqual(sessions);
  await expect(
    service.provision({ ...input, userId: 'legacy-profile' }),
  ).rejects.toThrow();
  expect(
    (
      await db.query("SELECT email FROM public.users WHERE id='legacy-profile'")
    )[0].email,
  ).toBeNull();
  await expect(
    service.provision({
      ...input,
      email: 'legacy@auth.test',
      userId: 'legacy-profile',
    }),
  ).resolves.toMatchObject({ id: 'legacy-profile' });
  await expect(
    auth.api.signInEmail({ body: { email: 'legacy@auth.test', password } }),
  ).resolves.toMatchObject({ user: { id: 'legacy-profile' } });
  await expect(
    service.provision({
      ...input,
      email: 'missing@auth.test',
      userId: 'missing',
    }),
  ).rejects.toThrow('not found');
  await expect(
    service.provision({ ...input, email: 'new@auth.test', role: 'admin' }),
  ).resolves.toMatchObject({ email: 'new@auth.test', role: 'admin' });
});
it.each([
  '/inventory',
  '/leads',
  '/documents',
  '/mock/sales/documents',
  '/mock/service/documents',
])('allows Admin and rejects Technician on %s', async (path) => {
  await request(app.getHttpServer())
    .get(path)
    .set('Authorization', 'Bearer ' + users.admin.jwt)
    .expect(200);
  await request(app.getHttpServer())
    .get(path)
    .set('Authorization', 'Bearer ' + users.technician.jwt)
    .expect(403);
});
it.each(['admin', 'technician'])(
  'allows full booking workflows for %s',
  async (role) => {
    const headers = { Authorization: 'Bearer ' + users[role].jwt };
    await request(app.getHttpServer())
      .get('/admin/bookings/catalog')
      .set(headers)
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/bookings?date=2030-01-02')
      .set(headers)
      .expect(200);
    await request(app.getHttpServer())
      .post('/admin/bookings')
      .set(headers)
      .send({
        name: 'Guest',
        email: 'guest@example.test',
        phoneNumber: '+84901234567',
        registrationNumber: 'TEST',
        serviceTypeId: booking.id,
        startsAt: '2030-01-02T10:00:00Z',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/admin/bookings/' + booking.id + '')
      .set(headers)
      .send({ startsAt: '2030-01-02T11:00:00Z', expectedVersion: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/admin/bookings/' + booking.id + '/status')
      .set(headers)
      .send({
        status: 'CANCELLED',
        cancellationReason: 'Fixture',
        expectedVersion: 1,
      })
      .expect(200);
  },
);
it('rejects shared keys, cookie-only business calls, malformed and tampered JWTs', async () => {
  for (const headers of [
    { Cookie: users.admin.cookie },
    { 'x-booking-admin-key': 'obsolete' },
    { Authorization: 'Bearer invalid' },
    { Authorization: 'Bearer ' + users.admin.jwt.slice(0, -8) + 'tampered' },
  ])
    await request(app.getHttpServer())
      .get('/inventory')
      .set(headers)
      .expect(401);
});
it('does not allow public signup, untrusted origins, or Technician role escalation', async () => {
  await request(app.getHttpServer())
    .post('/auth/sign-up/email')
    .set('Origin', origin)
    .send({
      name: 'Intruder',
      email: 'intruder@auth.test',
      password,
      role: 'admin',
    })
    .expect(400)
    .expect((response) =>
      expect(response.body.code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED'),
    );
  await request(app.getHttpServer())
    .post('/auth/sign-in/email')
    .set('Origin', 'https://untrusted.example')
    .send({ email: 'admin@auth.test', password })
    .expect(403);
  await request(app.getHttpServer())
    .post('/auth/admin/set-role')
    .set('Origin', origin)
    .set('Cookie', users.technician.cookie)
    .send({ userId: users.technician.id, role: 'admin' })
    .expect(403);
  await request(app.getHttpServer())
    .post('/auth/update-user')
    .set('Origin', origin)
    .set('Cookie', users.technician.cookie)
    .send({ name: 'Technician', role: 'admin' })
    .expect(400);
  await request(app.getHttpServer())
    .get('/inventory')
    .set('Authorization', 'Bearer ' + users.technician.jwt)
    .expect(403);
});
it('applies role changes immediately even when an earlier JWT said admin', async () => {
  await db.query('UPDATE public.users SET role=$1 WHERE id=$2', [
    'technician',
    users.admin.id,
  ]);
  try {
    await request(app.getHttpServer())
      .get('/inventory')
      .set('Authorization', 'Bearer ' + users.admin.jwt)
      .expect(403);
  } finally {
    await db.query('UPDATE public.users SET role=$1 WHERE id=$2', [
      'admin',
      users.admin.id,
    ]);
  }
});
it('invalidates JWT access immediately after the issuing session signs out', async () => {
  await request(app.getHttpServer())
    .post('/auth/sign-out')
    .set('Origin', origin)
    .set('Cookie', users.technician.cookie)
    .send({})
    .expect(200);
  await request(app.getHttpServer())
    .get('/admin/bookings?date=2030-01-02')
    .set('Authorization', 'Bearer ' + users.technician.jwt)
    .expect(401);
});
it('keeps auth tables inaccessible to browser database roles and stores no plaintext password', async () => {
  const [row] = await db.query('SELECT password FROM public.account LIMIT 1');
  expect(row.password).not.toBe(password);
  for (const role of ['anon', 'authenticated']) {
    const [exists] = await db.query(
      'SELECT EXISTS (SELECT FROM pg_roles WHERE rolname=$1) AS present',
      [role],
    );
    if (exists.present)
      expect(
        (
          await db.query(
            "SELECT has_table_privilege($1,'public.account','SELECT,INSERT,UPDATE,DELETE') AS allowed",
            [role],
          )
        )[0].allowed,
      ).toBe(false);
  }
});

it.each([
  { exp: 1 },
  { iss: 'https://other-issuer.example' },
  { aud: 'other-api' },
  { sid: 'revoked-session' },
])('rejects correctly signed JWTs with invalid claims %j', async (changed) => {
  const { token } = await auth.api.signJWT({
    body: { payload: { ...decodeJwt(users.admin.jwt), ...changed } },
  });
  await request(app.getHttpServer())
    .get('/inventory')
    .set('Authorization', 'Bearer ' + token)
    .expect(401);
});
