import { StaffAuthService } from '../src/auth/staff-auth.service.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { Database } from '../src/database/database.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { LeadsService } from '../src/leads/leads.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';

let app: INestApplication;
const id = '00000000-0000-4000-8000-000000000001';
const booking = { id, status: 'CONFIRMED' };
const create = vi.fn().mockResolvedValue(booking);
const schedule = {
  timeZone: 'UTC',
  hours: Array(7).fill({ open: '09:00', close: '17:00' }),
};
beforeAll(async () => {
  vi.stubEnv('BOOKING_ADMIN_KEY', 'unified-test-key');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StaffAuthService)
    .useValue({ authenticate: async () => ({ id: 'admin', role: 'admin' }) })
    .overrideProvider(Database)
    .useValue({})
    .overrideProvider(ScheduleRules)
    .useValue({ schedule })
    .overrideProvider(BookingsService)
    .useValue({
      listServices: async () => [
        { id, name: 'Oil change', durationMinutes: 60 },
      ],
      listBookings: async () => [booking],
      create,
    })
    .overrideProvider(InventoryService)
    .useValue({ list: async () => ({ vehicles: [] }) })
    .overrideProvider(LeadsService)
    .useValue({ list: async () => [] })
    .overrideProvider(DocumentsService)
    .useValue({ search: async () => ({ documents: [] }) })
    .compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
});
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

it('serves all four scenario APIs from one Nest application', async () => {
  await request(app.getHttpServer())
    .get('/inventory')
    .set('Authorization', 'Bearer test-jwt')
    .expect(200, { vehicles: [] });
  await request(app.getHttpServer())
    .get('/leads')
    .set('Authorization', 'Bearer test-jwt')
    .expect(200, []);
  await request(app.getHttpServer())
    .get('/documents')
    .set('Authorization', 'Bearer test-jwt')
    .expect(200, { documents: [] });
  await request(app.getHttpServer()).get('/schedule').expect(200, schedule);
  await request(app.getHttpServer()).get('/service-types').expect(200);
});
it('keeps guest booking validation and the staff guard in the merged app', async () => {
  await request(app.getHttpServer())
    .get('/admin/bookings')
    .query({ date: '2030-01-02' })
    .expect(401);
  await request(app.getHttpServer())
    .get('/admin/bookings')
    .query({ date: '2030-01-02' })
    .set('Authorization', 'Bearer test-jwt')
    .expect(200, [booking]);
  const body = {
    name: ' Guest ',
    email: ' Guest@Example.com ',
    phoneNumber: '+84901234567',
    registrationNumber: 'CAR',
    serviceTypeId: id,
    startsAt: '2030-01-02T10:00:00Z',
    technicianId: 'technician-selected', serviceBayId: id,
  };
  await request(app.getHttpServer())
    .post('/bookings')
    .send({ ...body, userId: id })
    .expect(400);
  expect(create).not.toHaveBeenCalled();
  await request(app.getHttpServer())
    .post('/bookings')
    .send(body)
    .expect(201, booking);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Guest', email: 'guest@example.com' }),
    { technicianId: body.technicianId, bayId: body.serviceBayId },
  );
});
