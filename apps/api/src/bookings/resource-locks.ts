import type { EntityManager } from 'typeorm';
import type { ResourcePair } from './booking.types.js';

export class CandidateChanged extends Error {}

export async function lockResources(
  manager: EntityManager,
  ...pairs: ResourcePair[]
): Promise<void> {
  // Lock old and new resources in the same order for every writer, including resource swaps.
  for (const [table, field] of [
    ['users', 'technicianId'],
    ['service_bays', 'bayId'],
  ] as const) {
    const ids = [...new Set(pairs.map((pair) => pair[field]))].sort();
    const rows = await manager.query<{ id: string }[]>(
      'SELECT id FROM public.' +
        table +
        ' WHERE id = ANY($1) ORDER BY id FOR UPDATE',
      [ids],
    );
    if (rows.length !== ids.length) throw new CandidateChanged();
  }
}
