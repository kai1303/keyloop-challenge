import { BadRequestException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LeadsService } from './leads.service.js';

const rows = [1, 2].map((n) => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  received_at: '2030-01-01T01:00:00.000Z',
  customer_name: 'Guest',
}));
function fixture(data = rows) {
  const query = Object.assign(Promise.resolve({ data, error: null }), {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });
  const db = { from: vi.fn(() => query) };
  return {
    service: new LeadsService(db as unknown as SupabaseClient),
    query,
    db,
  };
}
it('bounds a page and returns a continuation cursor without losing timestamp ties', async () => {
  const first = fixture();
  const page = await first.service.list({ limit: '1' });
  expect(page.leads).toEqual([rows[0]]);
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(first.query.limit).toHaveBeenCalledWith(2);
  const second = fixture([rows[1]]);
  expect(
    await second.service.list({ limit: '1', after: page.nextCursor! }),
  ).toEqual({ leads: [rows[1]], nextCursor: null });
  expect(second.query.or).toHaveBeenCalledWith(
    `received_at.lt.${rows[0].received_at},and(received_at.eq.${rows[0].received_at},id.gt.${rows[0].id})`,
  );
  expect(second.query.order.mock.calls).toEqual([
    ['received_at', { ascending: false }],
    ['id', { ascending: true }],
  ]);
});
it.each([
  { limit: '0' },
  { limit: '101' },
  { after: 'invalid' },
  {
    after: Buffer.from(
      JSON.stringify({ received_at: 'x),id.gt.0', id: rows[0].id }),
    ).toString('base64url'),
  },
  { unknown: 'value' },
])('rejects invalid paging inputs before storage access: %j', async (input) => {
  const { service, db } = fixture();
  await expect(service.list(input)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.from).not.toHaveBeenCalled();
});
it('uses a bounded default and an explicit end marker for an empty page', async () => {
  const { service, query } = fixture([]);
  expect(await service.list()).toEqual({ leads: [], nextCursor: null });
  expect(query.limit).toHaveBeenCalledWith(51);
});
