import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Database } from '../src/database/database.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { LeadsService } from '../src/leads/leads.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { BookingsService } from '../src/bookings/bookings.service.js';

let app: INestApplication;
beforeAll(async () => {
  vi.stubEnv('BOOKING_ADMIN_KEY', 'obsolete-shared-key');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Database)
    .useValue({})
    .overrideProvider(ScheduleRules)
    .useValue({ schedule: { timeZone: 'UTC', hours: [] } })
    .overrideProvider(InventoryService)
    .useValue({ list: async () => ({ vehicles: [] }) })
    .overrideProvider(LeadsService)
    .useValue({ list: async () => [] })
    .overrideProvider(DocumentsService)
    .useValue({ search: async () => ({ documents: [] }) })
    .overrideProvider(BookingsService)
    .useValue({ listBookings: async () => [] })
    .compile();
  app = module.createNestApplication();
  app.useLogger(false);
  await app.init();
});
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});
it.each([
  '/inventory',
  '/leads',
  '/documents',
  '/admin/bookings?date=2030-01-02',
])(
  'requires a JWT for %s, even when the former shared key is supplied',
  async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set('x-booking-admin-key', 'obsolete-shared-key')
      .expect(401);
  },
);
