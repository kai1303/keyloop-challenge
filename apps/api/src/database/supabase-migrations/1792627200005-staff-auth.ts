import { readFile } from 'node:fs/promises';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StaffAuth1792627200005 implements MigrationInterface {
  name = 'StaffAuth1792627200005';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      await readFile(new URL('./staff-auth.sql', import.meta.url), 'utf8'),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Auth rollback must preserve staff identities and sessions; restore from a verified backup',
      ),
    );
  }
}
