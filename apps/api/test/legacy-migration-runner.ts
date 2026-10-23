import type { QueryRunner } from 'typeorm';

// Exercise historical backfill SQL against the current table locations without rewriting migration history.
export function legacyMigrationRunner(runner: QueryRunner): QueryRunner {
  return new Proxy(runner, {
    get(target, key) {
      if (key === 'query')
        return (sql: string, parameters?: unknown[]) =>
          target.query(
            sql
              .replaceAll('scheduler.vehicles', 'public.booking_vehicles')
              .replaceAll('scheduler.', 'public.')
              .replaceAll("'public.timezone'", "'scheduler.timezone'")
              .replaceAll(
                'REFERENCES public.technicians(id)',
                'REFERENCES public.users(id)',
              )
              .replaceAll(
                'technician_id uuid REFERENCES public.users(id)',
                'technician_id text REFERENCES public.users(id)',
              ),
            parameters,
          );
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
