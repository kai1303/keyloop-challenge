import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { EntityManager } from 'typeorm';

export async function seedCatalog(manager: EntityManager): Promise<void> {
  const sql = await readFile(
    new URL('./seed-catalog.sql', import.meta.url),
    'utf8',
  );
  await manager.query(sql);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { default: db } = await import('./data-source.js');
  await db.initialize();
  try {
    await db.transaction(seedCatalog);
  } finally {
    await db.destroy();
  }
}
