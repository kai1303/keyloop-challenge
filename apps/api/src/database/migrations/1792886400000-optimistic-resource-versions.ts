import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisticResourceVersions1792886400000 implements MigrationInterface {
  name = 'OptimisticResourceVersions1792886400000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE public.users ADD COLUMN scheduling_version integer NOT NULL DEFAULT 0');
    await runner.query('ALTER TABLE public.service_bays ADD COLUMN scheduling_version integer NOT NULL DEFAULT 0');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE public.service_bays DROP COLUMN scheduling_version');
    await runner.query('ALTER TABLE public.users DROP COLUMN scheduling_version');
  }
}
