import type { EntityManager } from 'typeorm';
import { CandidateChanged, claimResources } from './resource-claims.js';

function fixture(staleId?: string) {
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (sql.startsWith('SELECT'))
      return (values[0] as string[]).map(id => ({ id, version: 7 }));
    if (sql.startsWith('WITH claimed AS'))
      return values[0] === staleId ? [] : [{ id: values[0] }];
    throw new Error('Unexpected resource operation');
  });
  return { query, manager: { query } as unknown as EntityManager };
}

it('reads resource versions before making ordered conditional claims without explicit locks', async () => {
  const { manager, query } = fixture();
  const first = { technicianId: 'tech-b', bayId: 'bay-b' };
  const second = { technicianId: 'tech-a', bayId: 'bay-a' };
  await claimResources(manager, first, second, first);
  const calls = query.mock.calls;
  expect(calls.some(([sql]) => /FOR UPDATE|FOR SHARE|advisory/i.test(sql))).toBe(false);
  const updates = calls.filter(([sql]) => sql.startsWith('WITH claimed AS'));
  expect(updates.map(([, values]) => values)).toEqual([
    ['tech-a', 7], ['tech-b', 7], ['bay-a', 7], ['bay-b', 7],
  ]);
  expect(calls.slice(0, 2).every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  for (const [sql] of updates)
    expect(sql).toContain('WHERE id=$1 AND scheduling_version=$2');
});

it('rejects a changed version so the transaction can roll back and retry', async () => {
  const { manager, query } = fixture('bay-a');
  await expect(claimResources(manager, { technicianId: 'tech-a', bayId: 'bay-a' }))
    .rejects.toBeInstanceOf(CandidateChanged);
  expect(query.mock.calls.filter(([sql]) => sql.startsWith('WITH claimed AS'))).toHaveLength(2);
});

it('rejects a missing resource before making any claims', async () => {
  const { manager, query } = fixture();
  query.mockResolvedValueOnce([]);
  await expect(claimResources(manager, { technicianId: 'tech-a', bayId: 'bay-a' }))
    .rejects.toBeInstanceOf(CandidateChanged);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('WITH claimed AS'))).toBe(false);
});
