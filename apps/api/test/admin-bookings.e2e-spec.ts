import { StaffAuthService } from '../src/auth/staff-auth.service.js';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Database } from '../src/database/database.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { configureApp } from '../src/configure-app.js';

const id = '00000000-0000-4000-8000-000000000001';
const payload = {
  name: 'Guest',
  email: 'guest@example.com',
  phoneNumber: '+84901234567',
  registrationNumber: 'CAR',
  serviceTypeId: id,
  startsAt: '2030-01-02T10:00:00Z',
};
describe('guarded admin booking HTTP contract', () => {
  let app: INestApplication;
  const service = {
    adminCatalog: vi.fn(),
    listBookings: vi.fn(),
    findBooking: vi.fn(),
    createAdmin: vi.fn(),
    reschedule: vi.fn(),
    changeStatus: vi.fn(),
    create: vi.fn(),
  };
  const authenticate = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StaffAuthService)
      .useValue({ authenticate })
      .overrideProvider(Database)
      .useValue({})
      .overrideProvider(ScheduleRules)
      .useValue({ schedule: { timeZone: 'UTC', hours: [] } })
      .overrideProvider(BookingsService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    authenticate.mockImplementation(async (token: string) => {
      if (token !== 'test-jwt') {
        const { UnauthorizedException } = await import('@nestjs/common');
        throw new UnauthorizedException();
      }
      return {
        id: 'admin',
        name: 'Admin',
        email: 'admin@example.test',
        role: 'admin',
      };
    });
    service.listBookings.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await app.close();
  });

  it.each([undefined, 'wrong', 'x'.repeat(500)])(
    'denies an absent or invalid JWT %s',
    async (token) => {
      const call = request(app.getHttpServer())
        .get('/admin/bookings')
        .query({ date: '2030-01-02' });
      if (token) call.set('Authorization', 'Bearer ' + token);
      await call.expect(401);
      expect(service.listBookings).not.toHaveBeenCalled();
    },
  );
  it('returns the private catalog and selected-day records only to admin', async () => {
    service.adminCatalog.mockResolvedValue({
      services: [],
      technicians: [],
      bays: [],
      schedule: { timeZone: 'UTC', hours: [] },
    });
    await request(app.getHttpServer())
      .get('/admin/bookings/catalog')
      .set('Authorization', 'Bearer test-jwt')
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/bookings')
      .query({ date: '2030-01-02' })
      .set('Authorization', 'Bearer test-jwt')
      .expect(200, []);
    expect(service.listBookings).toHaveBeenCalledWith('2030-01-02');
  });
  it('accepts explicit and automatic resources and passes validated versions', async () => {
    service.createAdmin.mockResolvedValue({
      id,
      email: payload.email,
      version: 1,
    });
    const response = await request(app.getHttpServer())
      .post('/admin/bookings')
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000088')
      .set('Authorization', 'Bearer test-jwt')
      .send({ ...payload, technicianId: id })
      .expect(201);
    expect(response.body).toMatchObject({ email: payload.email, version: 1 });
    expect(response.headers.location).toBe('/admin/bookings/' + id);
    expect(service.createAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ technicianId: id }),
      { key: '00000000-0000-4000-8000-000000000088', scope: 'staff:admin' },
    );
    await request(app.getHttpServer())
      .patch(`/admin/bookings/${id}`)
      .set('Authorization', 'Bearer test-jwt')
      .send({
        startsAt: payload.startsAt,
        serviceBayId: id,
        expectedVersion: 2,
      })
      .expect(200);
    expect(service.reschedule).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ expectedVersion: 2, serviceBayId: id }),
    );
    await request(app.getHttpServer())
      .patch(`/admin/bookings/${id}/status`)
      .set('Authorization', 'Bearer test-jwt')
      .send({
        status: 'CANCELLED',
        cancellationReason: 'Customer requested',
        expectedVersion: 3,
      })
      .expect(200);
    expect(service.changeStatus).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ status: 'CANCELLED', expectedVersion: 3 }),
    );
  });
  it('accepts an existing text staff ID for technician assignment', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/bookings/${id}`)
      .set('Authorization', 'Bearer test-jwt')
      .send({ startsAt: payload.startsAt, expectedVersion: 1, technicianId: 'staff-technician-abc123' })
      .expect(200);
    expect(service.reschedule).toHaveBeenCalledWith(id, expect.objectContaining({ technicianId: 'staff-technician-abc123' }));
  });
  it.each([
    { startsAt: payload.startsAt },
    { startsAt: payload.startsAt, expectedVersion: 0 },
    { startsAt: payload.startsAt, expectedVersion: '1' },
    { startsAt: payload.startsAt, expectedVersion: 1, technicianId: null },
    { startsAt: payload.startsAt, expectedVersion: 1, technicianId: 'auto' },
  ])('rejects invalid reschedule/version/resource fields %j', async (body) => {
    await request(app.getHttpServer())
      .patch(`/admin/bookings/${id}`)
      .set('Authorization', 'Bearer test-jwt')
      .send(body)
      .expect(400);
    expect(service.reschedule).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'OTHER', expectedVersion: 1 },
    {
      status: 'CANCELLED',
      expectedVersion: 1,
      cancellationReason: 'x'.repeat(501),
    },
    { status: 'COMPLETED', expectedVersion: 1, cancellationReason: null },
  ])('rejects invalid status fields %j', async (body) => {
    await request(app.getHttpServer())
      .patch(`/admin/bookings/${id}/status`)
      .set('Authorization', 'Bearer test-jwt')
      .send(body)
      .expect(400);
  });
  it('validates day and route ids and requires both guest resource selections', async () => {
    await request(app.getHttpServer())
      .get('/admin/bookings')
      .query({ date: '2030-02-30' })
      .set('Authorization', 'Bearer test-jwt')
      .expect(400);
    await request(app.getHttpServer())
      .patch('/admin/bookings/invalid/status')
      .set('Authorization', 'Bearer test-jwt')
      .send({ status: 'CANCELLED', expectedVersion: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000088')
      .send({ ...payload, serviceBayId: id })
      .expect(400);
  });
});

// Resource URLs expose details only through the existing staff guard.
it('retrieves an individual booking through the staff resource URL', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StaffAuthService).useValue({ authenticate: async () => ({ id: 'tech', role: 'technician' }) })
    .overrideProvider(Database).useValue({})
    .overrideProvider(ScheduleRules).useValue({ schedule: { timeZone: 'UTC', hours: [] } })
    .overrideProvider(BookingsService).useValue({ findBooking: async () => ({ id, name: 'Private guest' }) })
    .compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  configureApp(app);
  await app.init();
  try {
    await request(app.getHttpServer()).get('/admin/bookings/' + id).expect(401);
    await request(app.getHttpServer()).get('/admin/bookings/' + id)
      .set('Authorization', 'Bearer test-jwt').expect(200, { id, name: 'Private guest' });
    await request(app.getHttpServer()).get('/admin/bookings/invalid')
      .set('Authorization', 'Bearer test-jwt').expect(400);
    await request(app.getHttpServer()).get('/bookings/' + id).expect(404);
  } finally { await app.close(); }
});
