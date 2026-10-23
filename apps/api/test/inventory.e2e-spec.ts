import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InventoryModule } from '../src/inventory/inventory.module.js';
const id = '00000000-0000-4000-8000-000000000001';
const row = {
  id,
  registration: 'QUERY-HTTP',
  make: 'Ford',
  model: 'Kuga',
  model_year: 2022,
  price_pence: 100,
  stocked_on: '2020-01-01',
  current_action: null,
  note: null,
  action_updated_at: null,
  version: 0,
};
const rpc = vi.fn();
const single = vi.fn();
let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [InventoryModule] })
    .overrideProvider('INVENTORY_DB')
    .useValue({
      rpc,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: single }) }) }),
    })
    .compile();
  app = module.createNestApplication();
  await app.init();
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  rpc.mockReset().mockImplementation(async (name) => ({
    data:
      name === 'inventory_metadata'
        ? {
            summary: { total: 1000, aging: 200, needsAction: 100 },
            options: { Ford: ['Kuga'] },
          }
        : [
            { vehicle: row, cursor_values: [row.stocked_on, id] },
            {
              vehicle: { ...row, id: '00000000-0000-4000-8000-000000000002' },
              cursor_values: [
                row.stocked_on,
                '00000000-0000-4000-8000-000000000002',
              ],
            },
          ],
    error: null,
  }));
  single.mockReset().mockResolvedValue({ data: row, error: null });
});
it('combines validated filters, database ordering and opaque cursor pagination', async () => {
  const first = await request(app.getHttpServer())
    .get('/inventory')
    .query({
      make: ['Ford', 'Toyota'],
      model: 'Kuga',
      age: 'aging',
      action: 'needsAction',
      limit: 1,
    })
    .expect(200);
  expect(first.body.vehicles).toHaveLength(1);
  expect(first.body.nextCursor).toEqual(expect.any(String));
  expect(rpc).toHaveBeenLastCalledWith(
    'inventory_page',
    expect.objectContaining({
      p_make: ['Ford', 'Toyota'],
      p_model: ['Kuga'],
      p_age: 'aging',
      p_action: 'needsAction',
      p_limit: 1,
      p_after: null,
    }),
  );
  await request(app.getHttpServer())
    .get('/inventory')
    .query({
      make: ['Ford', 'Toyota'],
      model: 'Kuga',
      age: 'aging',
      action: 'needsAction',
      limit: 1,
      after: first.body.nextCursor,
    })
    .expect(200);
  expect(rpc).toHaveBeenLastCalledWith(
    'inventory_page',
    expect.objectContaining({ p_after: [row.stocked_on, id] }),
  );
  rpc.mockClear();
  await request(app.getHttpServer())
    .get('/inventory')
    .query({ limit: 1, after: first.body.nextCursor })
    .expect(400);
  expect(rpc).not.toHaveBeenCalled();
});
it('returns global metadata and reloads a vehicle independently of page membership', async () => {
  const result = await request(app.getHttpServer())
    .get('/inventory/metadata')
    .expect(200);
  expect(result.body.summary.total).toBe(1000);
  expect(
    (
      await request(app.getHttpServer())
        .get('/inventory/' + id)
        .expect(200)
    ).body.id,
  ).toBe(id);
  single.mockResolvedValueOnce({ data: null, error: null });
  await request(app.getHttpServer())
    .get('/inventory/' + id)
    .expect(404);
});
it.each([
  { limit: 101 },
  { sort: 'note:asc' },
  { after: 'invalid' },
  { unknown: 'field' },
])('rejects invalid input before querying storage', async (query) => {
  await request(app.getHttpServer()).get('/inventory').query(query).expect(400);
  expect(rpc).not.toHaveBeenCalled();
});
it('bounds storage failures without exposing private errors', async () => {
  rpc.mockRejectedValueOnce(new Error('private connection detail'));
  const result = await request(app.getHttpServer())
    .get('/inventory')
    .expect(503);
  expect(result.body.message).toBe('Unable to load inventory');
});
