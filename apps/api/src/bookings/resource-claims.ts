import type { EntityManager } from 'typeorm';
import type { ResourcePair } from './booking.types.js';

export class CandidateChanged extends Error {}

export async function claimResources(
  manager: EntityManager,
  ...pairs: ResourcePair[]
): Promise<void> {
  const resources: { table: string; id: string; version: number }[] = [];
  // Observe all old/new resource versions before attempting any conditional writes.
  for (const [table, field] of [
    ['users', 'technicianId'],
    ['service_bays', 'bayId'],
  ] as const) {
    const ids = [...new Set(pairs.map((pair) => pair[field]))].sort();
    const rows = await manager.query<{ id: string; version: number }[]>(
      'SELECT id,scheduling_version AS version FROM public.' +
        table +
        ' WHERE id = ANY($1) ORDER BY id',
      [ids],
    );
    if (rows.length !== ids.length) throw new CandidateChanged();
    resources.push(...rows.map(row => ({ table, ...row })));
  }
  for (const { table, id, version } of resources) {
    const rows = await manager.query<{ id: string }[]>(
      'WITH claimed AS (UPDATE public.' + table +
        ' SET scheduling_version=scheduling_version+1 WHERE id=$1 AND scheduling_version=$2 RETURNING id) SELECT id FROM claimed',
      [id, version],
    );
    if (!rows.length) throw new CandidateChanged();
  }
}
