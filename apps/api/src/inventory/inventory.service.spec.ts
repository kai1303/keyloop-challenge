import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InventoryService } from './inventory.service.js';

const id = '00000000-0000-4000-8000-000000000008';
it('maps a stale database version to HTTP 409 without leaking the raw error', async () => {
  const single = vi.fn().mockResolvedValue({
    data: null,
    error: { code: '40001', message: 'private SQL details' },
  });
  const rpc = vi.fn().mockReturnValue({ single });
  const service = new InventoryService({ rpc } as unknown as SupabaseClient);
  await expect(
    service.save(id, { action: 'Monitor Stock', expectedVersion: 0 }),
  ).rejects.toMatchObject({ status: 409 });
  expect(rpc).toHaveBeenCalledWith('save_inventory_action', {
    p_id: id,
    p_action: 'Monitor Stock',
    p_note: null,
    p_expected_version: 0,
  });
});
it.each([
  ['P0002', 404],
  ['22023', 400],
  ['connection_failure', 503],
])('maps %s safely', async (code, status) => {
  const rpc = () => ({
    single: async () => ({
      data: null,
      error: { code, message: 'private SQL details' },
    }),
  });
  const service = new InventoryService({ rpc } as unknown as SupabaseClient);
  await expect(
    service.save(id, { action: 'Monitor Stock', expectedVersion: 0 }),
  ).rejects.toMatchObject({ status });
});
it('reports missing configuration as 503 instead of fictional inventory', async () => {
  await expect(new InventoryService(null).list()).rejects.toMatchObject({
    status: 503,
  });
});

it('fetches one keyset page and retains an opaque next cursor without counting', async () => {
  const row = {
    id,
    registration: 'TEST',
    make: 'Ford',
    model: 'Kuga',
    model_year: 2022,
    price_pence: 10,
    stocked_on: '2020-01-01',
    current_action: null,
    note: null,
    action_updated_at: null,
    version: 0,
  };
  const rpc = vi.fn().mockResolvedValue({
    data: [
      { vehicle: row, cursor_values: [10, id] },
      {
        vehicle: { ...row, id: '00000000-0000-4000-8000-000000000009' },
        cursor_values: [10, '00000000-0000-4000-8000-000000000009'],
      },
    ],
    error: null,
  });
  const result = await new InventoryService({
    rpc,
  } as unknown as SupabaseClient).list({
    limit: '1',
    sort: 'pricePence:asc',
    make: 'Ford',
    age: 'aging',
  });
  expect(result.vehicles).toHaveLength(1);
  expect(result.nextCursor).toEqual(expect.any(String));
  expect(rpc).toHaveBeenCalledWith(
    'inventory_page',
    expect.objectContaining({
      p_make: ['Ford'],
      p_age: 'aging',
      p_limit: 1,
      p_after: null,
    }),
  );
});
it('rejects invalid sorts before accessing the database', async () => {
  const rpc = vi.fn();
  await expect(
    new InventoryService({ rpc } as unknown as SupabaseClient).list({
      sort: 'note:asc',
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(rpc).not.toHaveBeenCalled();
});
it('maps failed page reads to a safe service error', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: null, error: { message: 'private SQL error' } });
  await expect(
    new InventoryService({ rpc } as unknown as SupabaseClient).list(),
  ).rejects.toMatchObject({ status: 503, message: 'Unable to load inventory' });
});
