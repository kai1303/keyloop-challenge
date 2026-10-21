import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InventoryService } from './inventory.service.js';

const id = '00000000-0000-4000-8000-000000000008';
it('maps a stale database version to HTTP 409 without leaking the raw error', async () => {
  const single = vi
    .fn()
    .mockResolvedValue({
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
