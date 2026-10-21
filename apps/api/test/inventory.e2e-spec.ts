import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
const order = vi.fn();
const single = vi.fn();
beforeEach(async () => {
  single.mockClear();
  order.mockClear();
  order.mockResolvedValue({ data: [], error: null });
  single.mockResolvedValue({ data: null, error: { code: '40001' } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider('INVENTORY_DB')
    .useValue({
      from: () => ({ select: () => ({ order }) }),
      rpc: () => ({ single }),
    })
    .compile();
  app = module.createNestApplication();
  await app.init();
});
afterEach(async () => {
  await app.close();
});
it('returns a real empty snapshot with dealership metadata', async () => {
  const response = await request(app.getHttpServer())
    .get('/inventory')
    .expect(200);
  expect(response.body.vehicles).toEqual([]);
  expect(response.body.timeZone).toBe('Asia/Ho_Chi_Minh');
  expect(response.body.dealershipDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
it('rejects unexpected fields before writing', async () => {
  await request(app.getHttpServer())
    .patch('/inventory/00000000-0000-4000-8000-000000000008/action')
    .send({ action: 'Monitor Stock', expectedVersion: 0, pricePence: 0 })
    .expect(400);
  expect(single).not.toHaveBeenCalled();
});
it('rejects malformed IDs and exposes version conflicts as 409', async () => {
  await request(app.getHttpServer())
    .patch('/inventory/not-an-id/action')
    .send({ action: 'Monitor Stock', expectedVersion: 0 })
    .expect(400);
  await request(app.getHttpServer())
    .patch('/inventory/00000000-0000-4000-8000-000000000008/action')
    .send({ action: 'Monitor Stock', expectedVersion: 0 })
    .expect(409);
});
