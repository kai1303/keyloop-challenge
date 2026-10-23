# Appointment Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested guest-booking API that persists appointments in Supabase PostgreSQL and prevents overlapping technician/bay reservations.

**Architecture:** NestJS owns validation, opening-hours rules, resource allocation, and customer records. TypeORM supplies PostgreSQL transactions and explicit migrations; parameterized SQL makes resource selection and row locks visible without adding a repository layer or duplicate unused ORM mappings. Pessimistic locks on the selected technician and bay, followed by a fresh availability query at READ COMMITTED, protect confirmation.

**Tech Stack:** Existing NestJS 12 / TypeScript / Vitest starter; TypeORM 0.3.28, pg 8.23.1, Luxon 3.7.2, class-validator, class-transformer, PostgreSQL. Supabase Realtime is a separate, dependent plan.

---

## Boundaries and execution context

Workspace root: /Users/kai/works/side-project/keyloop-interview. Run commands here unless a command explicitly changes directory.

Spec: /Users/kai/works/side-project/keyloop-interview/docs/superpowers/specs/2026-10-21-appointment-scheduler-design.md.

Next plan: /Users/kai/works/side-project/keyloop-interview/docs/superpowers/plans/2026-10-21-appointment-realtime.md.

This plan implements the booking backend first. The second plan implements a database Broadcast trigger and an isolated browser availability monitor. They are separate deliverables because core correctness can be proved with ordinary local PostgreSQL, while actual Broadcast delivery needs Supabase.

The existing starter, UI, manifests, and lockfile are untracked. There is also an unrelated inventory-dashboard spec. Do not use git add ., reset files, or include inventory work. A worktree created from HEAD currently omits the untracked starter and the uncommitted scheduler design: use this populated checkout for planning, and establish a scoped source baseline before moving implementation to an isolated checkout. Re-read files before applying plan snippets if another chat has changed them.

No hosted connection credentials or actual dealership hours were supplied. Local test values below are explicitly fixtures. For hosted operation supply the real hours, timezone, connection string, and CA certificate through ignored environment files. Do not print connection strings or run destructive tests against Supabase.

CodeGraph currently indexes only two manifests; it does not supply the starter source. Use CodeGraph first during execution; if coverage remains absent, inspect the exact paths named here rather than searching the entire repo.

## File map

- Modify apps/api/package.json: dependencies and database/test commands.
- Modify apps/api/nest-cli.json: copy SQL assets into dist.
- Modify apps/api/src/app.module.ts and src/main.ts: wire database, rules, routes, and request validation.
- Modify apps/api/test/app.e2e-spec.ts: keep the original root-route test independent of a database.
- Create apps/api/.env.example and .env.test.example: safe configuration examples.
- Create compose.scheduler-test.yaml: disposable local PostgreSQL, isolated port/database.
- Create apps/api/src/database/connection-options.ts and connection-options.spec.ts: URL and verified-TLS configuration.
- Create apps/api/src/database/database.ts: Nest-managed TypeORM connection lifecycle.
- Create apps/api/src/database/data-source.ts: migration CLI entrypoint.
- Create apps/api/src/database/migrations/1792540800000-initial-scheduler.ts and initial-schema.sql: six domain tables, qualification join, foreign keys, indexes, constraints.
- Create apps/api/src/database/seed.ts and seed-catalog.sql: idempotent service/resource catalog fixtures.
- Create apps/api/src/bookings/booking.types.ts: request/domain/response contracts.
- Create apps/api/src/bookings/schedule-rules.ts and schedule-rules.spec.ts: timezone, duration, and weekly-hours validation.
- Create apps/api/src/bookings/available-pair.ts and available-pair.spec.ts: shared resource availability query.
- Create apps/api/src/bookings/bookings.service.ts and bookings.service.spec.ts: atomic confirmation and bounded retries.
- Create apps/api/src/bookings/bookings.dto.ts and bookings.dto.spec.ts: HTTP trust-boundary validation.
- Create apps/api/src/bookings/bookings.controller.ts: service catalog, exact-time availability, booking POST.
- Create apps/api/src/configure-app.ts: shared ValidationPipe setup.
- Create apps/api/vitest.config.integration.ts, test/database-fixture.ts, test/database.integration-spec.ts, and test/bookings.integration-spec.ts: guarded real-PostgreSQL tests.
- Create apps/api/test/bookings.e2e-spec.ts: HTTP validation and response contracts without a live database.
- Modify apps/api/README.md and root README.md: actual commands, request/response contracts, limitations.

All domain entities are persisted tables. Typed SQL result interfaces are used where data crosses the service boundary. Do not generate unused entity classes, generic repositories, authentication, management CRUD, Redis locks, advisory locks, or exclusion constraints in this version.

## Task 1: Install dependencies and validate PostgreSQL configuration

**Files:** Modify apps/api/package.json; create apps/api/src/database/connection-options.ts and connection-options.spec.ts.

- [ ] **Step 1: Install the selected packages.**

~~~sh
pnpm --filter @keyloop-interview/api add typeorm@0.3.28 pg@8.23.1 luxon@3.7.2 class-validator@0.15.1 class-transformer@0.5.1
pnpm --filter @keyloop-interview/api add -D @types/luxon@3.7.6
~~~

The TypeORM version is intentionally pinned to the supported 0.3 line, rather than accidentally adopting the newer 1.x API. The Nest-specific TypeORM integration is unnecessary for this one custom connection provider.

- [ ] **Step 2: Add these configuration tests.**

apps/api/src/database/connection-options.spec.ts:

~~~ts
import { connectionOptions } from './connection-options.js';

describe('connectionOptions', () => {
  it('requires a database URL', () => {
    expect(() => connectionOptions({})).toThrow('DATABASE_URL is required');
  });

  it('accepts a local PostgreSQL fixture without TLS', () => {
    const result = connectionOptions({
      DATABASE_URL: 'postgresql://scheduler_test:test@127.0.0.1:54329/scheduler_test',
    });
    expect(result).toMatchObject({
      type: 'postgres', synchronize: false, logging: false, ssl: false,
    });
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() => connectionOptions({ DATABASE_URL: 'https://example.com' }))
      .toThrow('Expected a PostgreSQL URL');
  });

  it('requires a CA certificate for a hosted connection', () => {
    expect(() => connectionOptions({
      DATABASE_URL: 'postgresql://app:example@db.example.com/postgres',
    })).toThrow('PGSSLROOTCERT is required for hosted PostgreSQL');
  });
});
~~~

- [ ] **Step 3: Run the new test before implementing the function.**

~~~sh
pnpm --filter @keyloop-interview/api test src/database/connection-options.spec.ts
~~~

Expected: FAIL because connectionOptions is absent; after the module exists, each assertion must fail for the missing behavior before its implementation is completed.

- [ ] **Step 4: Implement configuration without disabling certificate verification.**

apps/api/src/database/connection-options.ts:

~~~ts
import { readFileSync } from 'node:fs';
import type { DataSourceOptions } from 'typeorm';

export function connectionOptions(
  env: Record<string, string | undefined> = process.env,
): DataSourceOptions {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Expected a PostgreSQL URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && !env.PGSSLROOTCERT) {
    throw new Error('PGSSLROOTCERT is required for hosted PostgreSQL');
  }
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    url.searchParams.delete(key);
  }
  return {
    type: 'postgres',
    url: url.toString(),
    entities: [],
    synchronize: false,
    logging: false,
    ssl: local ? false : {
      rejectUnauthorized: true,
      ca: readFileSync(env.PGSSLROOTCERT!, 'utf8'),
    },
    extra: { max: 5, application_name: 'appointment-scheduler' },
  };
}
~~~

The TLS parameters are removed from the URL before applying the explicit verified-TLS configuration so URL parsing cannot silently replace it.

- [ ] **Step 5: Re-run tests, inspect the scoped changes, and commit only this task's files.**

~~~sh
pnpm --filter @keyloop-interview/api test src/database/connection-options.spec.ts
pnpm --filter @keyloop-interview/api typecheck
git add apps/api/src/database/connection-options.ts apps/api/src/database/connection-options.spec.ts apps/api/package.json pnpm-lock.yaml
git diff --cached --stat
git commit -m "feat(api): validate PostgreSQL connection configuration"
~~~

Expected: configuration tests and typecheck PASS. Since manifests/lockfile started untracked, inspect their complete contents before staging; do not claim unrelated pre-existing dependency changes as this task's work.

## Task 2: Create the schema and migration tooling

**Files:** Create the migration, SQL schema, database provider, CLI source, test Compose file and integration harness listed below; modify package scripts and SQL asset copying.

- [ ] **Step 1: Add a local database and a guarded integration test entrypoint.**

compose.scheduler-test.yaml:

~~~yaml
name: keyloop-scheduler-tests
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: scheduler_test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: scheduler_test
    ports:
      - "127.0.0.1:54329:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scheduler_test -d scheduler_test"]
      interval: 2s
      timeout: 2s
      retries: 20
~~~

apps/api/.env.test.example:

~~~dotenv
TEST_DATABASE_URL=postgresql://scheduler_test:test@127.0.0.1:54329/scheduler_test
~~~

apps/api/vitest.config.integration.ts:

~~~ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.integration-spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
~~~

Start with apps/api/test/database-fixture.ts containing:

~~~ts
import { DataSource } from 'typeorm';
import { connectionOptions } from '../src/database/connection-options.js';

export function testDatabase(): DataSource {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('Set TEST_DATABASE_URL to the disposable local test database');
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/scheduler_test') {
    throw new Error('Integration tests require the local scheduler_test database');
  }
  return new DataSource(connectionOptions({ DATABASE_URL: value }));
}
~~~

apps/api/test/database.integration-spec.ts:

~~~ts
import { testDatabase } from './database-fixture.js';

describe('scheduler schema', () => {
  const db = testDatabase();
  beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
  afterAll(async () => { if (db.isInitialized) await db.destroy(); });

  it('creates all six domain tables and the qualification join', async () => {
    const rows: { table_name: string }[] = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'scheduler'",
    );
    expect(rows.map(row => row.table_name).sort()).toEqual([
      'service_bays', 'service_bookings', 'service_types',
      'technician_service_types', 'technicians', 'users', 'vehicles',
    ]);
  });
});
~~~

Add this script to apps/api/package.json using the following exact update:

~~~sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'apps/api/package.json';
const value = JSON.parse(readFileSync(path, 'utf8'));
Object.assign(value.scripts, {
  'test:integration': 'node --env-file-if-exists=.env.test node_modules/vitest/vitest.mjs run --config vitest.config.integration.ts',
  'migration:run': 'node --env-file-if-exists=.env node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js',
  'db:seed': 'node --env-file-if-exists=.env dist/database/seed.js',
});
writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
JS
docker compose -f compose.scheduler-test.yaml up -d --wait
cp -n apps/api/.env.test.example apps/api/.env.test
pnpm --filter @keyloop-interview/api test:integration
~~~

Expected: on a fresh fixture database, FAIL because the schema tables do not exist. No missing database configuration is a passing or skipped test.

- [ ] **Step 2: Add the actual schema SQL.**

apps/api/src/database/migrations/initial-schema.sql:

~~~sql
CREATE SCHEMA scheduler;
REVOKE ALL ON SCHEMA scheduler FROM PUBLIC;

CREATE TABLE scheduler.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) > 0),
  phone_number varchar(30) NOT NULL CHECK (length(btrim(phone_number)) > 0)
);
CREATE TABLE scheduler.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES scheduler.users(id),
  registration_number varchar(32) NOT NULL CHECK (length(btrim(registration_number)) > 0),
  UNIQUE (user_id, registration_number)
);
CREATE TABLE scheduler.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0)
);
CREATE TABLE scheduler.service_bays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL
);
CREATE TABLE scheduler.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL
);
CREATE TABLE scheduler.technician_service_types (
  technician_id uuid NOT NULL REFERENCES scheduler.technicians(id),
  service_type_id uuid NOT NULL REFERENCES scheduler.service_types(id),
  PRIMARY KEY (technician_id, service_type_id)
);
CREATE TABLE scheduler.service_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES scheduler.users(id),
  vehicle_id uuid NOT NULL REFERENCES scheduler.vehicles(id),
  service_type_id uuid NOT NULL REFERENCES scheduler.service_types(id),
  technician_id uuid NOT NULL REFERENCES scheduler.technicians(id),
  service_bay_id uuid NOT NULL REFERENCES scheduler.service_bays(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status = 'CONFIRMED'),
  submitted_name varchar(100) NOT NULL,
  submitted_email varchar(254) NOT NULL,
  submitted_phone_number varchar(30) NOT NULL,
  CHECK (isfinite(starts_at) AND isfinite(ends_at) AND ends_at > starts_at)
);
CREATE INDEX booking_technician_interval ON scheduler.service_bookings
  (technician_id, starts_at, ends_at) WHERE status = 'CONFIRMED';
CREATE INDEX booking_bay_interval ON scheduler.service_bookings
  (service_bay_id, starts_at, ends_at) WHERE status = 'CONFIRMED';

DO $permissions$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA scheduler FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA scheduler FROM %I', role_name);
    END IF;
  END LOOP;
END;
$permissions$;
~~~

No cascade deletes are added. The schema must not be added to Supabase's exposed Data API schemas.

- [ ] **Step 3: Add the migration, runtime provider, and CLI source.**

apps/api/src/database/migrations/1792540800000-initial-scheduler.ts:

~~~ts
import { readFile } from 'node:fs/promises';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialScheduler1792540800000 implements MigrationInterface {
  name = 'InitialScheduler1792540800000';

  async up(runner: QueryRunner): Promise<void> {
    const sql = await readFile(new URL('./initial-schema.sql', import.meta.url), 'utf8');
    await runner.query(sql);
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of [
      'service_bookings', 'technician_service_types', 'vehicles',
      'technicians', 'service_bays', 'service_types', 'users',
    ]) {
      await runner.query('DROP TABLE scheduler.' + table);
    }
    await runner.query('DROP SCHEMA scheduler');
  }
}
~~~

apps/api/src/database/database.ts:

~~~ts
import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { connectionOptions } from './connection-options.js';

@Injectable()
export class Database extends DataSource implements OnModuleInit, OnModuleDestroy {
  constructor() { super(connectionOptions()); }
  async onModuleInit(): Promise<void> { await this.initialize(); }
  async onModuleDestroy(): Promise<void> {
    if (this.isInitialized) await this.destroy();
  }
}
~~~

apps/api/src/database/data-source.ts:

~~~ts
import { DataSource } from 'typeorm';
import { connectionOptions } from './connection-options.js';
import { InitialScheduler1792540800000 } from './migrations/1792540800000-initial-scheduler.js';

export default new DataSource({
  ...connectionOptions(),
  migrations: [InitialScheduler1792540800000],
  migrationsTableName: 'appointment_scheduler_migrations',
});
~~~

Replace apps/api/nest-cli.json with:

~~~json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": ["database/**/*.sql"],
    "watchAssets": true
  }
}
~~~

Replace apps/api/test/database-fixture.ts with this complete guarded migration fixture:

~~~ts
import { DataSource } from 'typeorm';
import { connectionOptions } from '../src/database/connection-options.js';
import { InitialScheduler1792540800000 } from '../src/database/migrations/1792540800000-initial-scheduler.js';

export function testDatabase(): DataSource {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('Set TEST_DATABASE_URL to the disposable local test database');
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/scheduler_test') {
    throw new Error('Integration tests require the local scheduler_test database');
  }
  return new DataSource({
    ...connectionOptions({ DATABASE_URL: value }),
    migrations: [InitialScheduler1792540800000],
    migrationsTableName: 'appointment_scheduler_migrations',
  });
}
~~~

- [ ] **Step 4: Run integration tests and confirm SQL assets are built.**

~~~sh
pnpm --filter @keyloop-interview/api test:integration
pnpm --filter @keyloop-interview/api build
test -f apps/api/dist/database/migrations/initial-schema.sql
~~~

Expected: table test PASS; build succeeds; copied SQL file exists.

- [ ] **Step 5: Commit the exact task files.**

~~~sh
git add compose.scheduler-test.yaml apps/api/.env.test.example apps/api/vitest.config.integration.ts apps/api/test/database-fixture.ts apps/api/test/database.integration-spec.ts apps/api/src/database/database.ts apps/api/src/database/data-source.ts apps/api/src/database/migrations/1792540800000-initial-scheduler.ts apps/api/src/database/migrations/initial-schema.sql apps/api/nest-cli.json apps/api/package.json
git diff --cached --check
git commit -m "feat(api): add scheduler schema and explicit migrations"
~~~

## Task 3: Implement fixed-duration and opening-hours rules

**Files:** Create apps/api/src/bookings/booking.types.ts, schedule-rules.ts, and schedule-rules.spec.ts.

- [ ] **Step 1: Add the shared contracts.**

apps/api/src/bookings/booking.types.ts:

~~~ts
export interface BookingInput {
  name: string;
  email: string;
  phoneNumber: string;
  registrationNumber: string;
  serviceTypeId: string;
  startsAt: string;
}
export interface ServiceType {
  id: string;
  name: string;
  durationMinutes: number;
}
export interface Interval {
  startsAt: Date;
  endsAt: Date;
  date: string;
}
export interface ResourcePair {
  technicianId: string;
  bayId: string;
}
export interface Availability {
  serviceTypeId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
}
export interface Confirmation {
  id: string;
  service: ServiceType;
  registrationNumber: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED';
}
~~~

- [ ] **Step 2: Add meaningful deterministic rule tests.**

apps/api/src/bookings/schedule-rules.spec.ts:

~~~ts
import { ScheduleRules, readSchedule } from './schedule-rules.js';

const weekdays = Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' }));
const now = new Date('2030-01-01T00:00:00Z');
const rules = new ScheduleRules({ timeZone: 'UTC', hours: weekdays });

describe('ScheduleRules', () => {
  it('calculates the service end and dealership date', () => {
    expect(rules.interval('2030-01-02T10:00:00Z', 60, now)).toEqual({
      startsAt: new Date('2030-01-02T10:00:00Z'),
      endsAt: new Date('2030-01-02T11:00:00Z'),
      date: '2030-01-02',
    });
  });

  it('accepts ending exactly at closing time', () => {
    expect(rules.interval('2030-01-02T16:00:00Z', 60, now).endsAt.toISOString())
      .toBe('2030-01-02T17:00:00.000Z');
  });

  it.each([
    ['2030-01-02T08:59:00Z', 30],
    ['2030-01-02T16:30:00Z', 60],
    ['2029-12-31T10:00:00Z', 30],
    ['2030-01-02T10:00:00', 30],
    ['invalid', 30],
    ['2030-01-02T10:00:00Z', 0],
  ])('rejects invalid interval %s / %s minutes', (start, duration) => {
    expect(() => rules.interval(start as string, duration as number, now)).toThrow();
  });

  it('rejects a closed day', () => {
    const closed = new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill(null) });
    expect(() => closed.interval('2030-01-02T10:00:00Z', 60, now)).toThrow();
  });

  it('evaluates local hours across daylight-saving changes', () => {
    const ny = new ScheduleRules({ timeZone: 'America/New_York', hours: weekdays });
    expect(ny.interval('2030-03-11T13:00:00Z', 60, now).date).toBe('2030-03-11');
    expect(ny.interval('2030-01-02T14:00:00Z', 60, now).date).toBe('2030-01-02');
    expect(() => ny.interval('2030-03-11T12:00:00Z', 60, now)).toThrow();
  });

  it('fails startup configuration for missing or invalid hours/timezone', () => {
    expect(() => readSchedule({})).toThrow();
    expect(() => readSchedule({
      DEALERSHIP_TIMEZONE: 'Not/AZone', DEALERSHIP_OPENING_HOURS: JSON.stringify(weekdays),
    })).toThrow();
    expect(() => readSchedule({
      DEALERSHIP_TIMEZONE: 'UTC',
      DEALERSHIP_OPENING_HOURS: JSON.stringify([{ open: '17:00', close: '09:00' }]),
    })).toThrow();
  });
});
~~~

- [ ] **Step 3: Run the new test and observe the missing-rule failure.**

~~~sh
pnpm --filter @keyloop-interview/api test src/bookings/schedule-rules.spec.ts
~~~

Expected: FAIL until schedule-rules.ts implements the requested behavior.

- [ ] **Step 4: Implement validated weekly hours using a timezone library.**

apps/api/src/bookings/schedule-rules.ts:

~~~ts
import { BadRequestException } from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';
import type { Interval } from './booking.types.js';

interface Hours { open: string; close: string }
export interface Schedule { timeZone: string; hours: (Hours | null)[] }

export function readSchedule(
  env: Record<string, string | undefined> = process.env,
): Schedule {
  const timeZone = env.DEALERSHIP_TIMEZONE;
  if (!timeZone || !IANAZone.isValidZone(timeZone)) {
    throw new Error('DEALERSHIP_TIMEZONE must be an IANA timezone');
  }
  const input: unknown = JSON.parse(env.DEALERSHIP_OPENING_HOURS ?? 'null');
  if (!Array.isArray(input) || input.length !== 7) {
    throw new Error('Opening hours require seven entries, Monday through Sunday');
  }
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const entry of input) {
    if (entry === null) continue;
    if (typeof entry !== 'object' ||
        typeof entry.open !== 'string' || typeof entry.close !== 'string' ||
        !time.test(entry.open) || !time.test(entry.close) || entry.open >= entry.close) {
      throw new Error('Each day must be null or a same-day open/close interval');
    }
  }
  return { timeZone, hours: input as (Hours | null)[] };
}

export class ScheduleRules {
  constructor(readonly schedule: Schedule) {}

  interval(input: string, durationMinutes: number, now = new Date()): Interval {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(input) ||
        !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new BadRequestException('A zoned start time and positive duration are required');
    }
    const start = DateTime.fromISO(input, { setZone: true });
    if (!start.isValid || start.toMillis() <= now.getTime()) {
      throw new BadRequestException('The appointment must start in the future');
    }
    const end = start.plus({ minutes: durationMinutes });
    const local = start.setZone(this.schedule.timeZone);
    const date = local.toISODate()!;
    const hours = this.schedule.hours[local.weekday - 1];
    if (!hours) throw new BadRequestException('The dealership is closed');
    const open = DateTime.fromISO(date + 'T' + hours.open, { zone: this.schedule.timeZone });
    const close = DateTime.fromISO(date + 'T' + hours.close, { zone: this.schedule.timeZone });
    if (!end.isValid || start.toMillis() < open.toMillis() || end.toMillis() > close.toMillis()) {
      throw new BadRequestException('The full appointment must fit inside opening hours');
    }
    return { startsAt: start.toJSDate(), endsAt: end.toJSDate(), date };
  }
}
~~~

- [ ] **Step 5: Run the tests and commit.**

~~~sh
pnpm --filter @keyloop-interview/api test src/bookings/schedule-rules.spec.ts
pnpm --filter @keyloop-interview/api typecheck
git add apps/api/src/bookings/booking.types.ts apps/api/src/bookings/schedule-rules.ts apps/api/src/bookings/schedule-rules.spec.ts
git commit -m "feat(api): enforce service duration and dealership opening hours"
~~~

Expected: rule tests and typecheck PASS. Do not replace real opening hours with the UTC test fixture in hosted configuration.

## Task 4: Share one full-duration availability query

**Files:** Create apps/api/src/bookings/available-pair.ts and available-pair.spec.ts.

- [ ] **Step 1: Add query-boundary tests.** These tests cover the helper's parameter/result contract; Task 8 proves qualification and overlap semantics against real PostgreSQL.

apps/api/src/bookings/available-pair.spec.ts:

~~~ts
import type { EntityManager } from 'typeorm';
import { availablePair } from './available-pair.js';

const interval = {
  startsAt: new Date('2030-01-02T10:00:00Z'),
  endsAt: new Date('2030-01-02T11:00:00Z'),
  date: '2030-01-02',
};
const pair = { technicianId: 'tech', bayId: 'bay' };

it('returns null when no eligible pair is returned', async () => {
  const query = vi.fn().mockResolvedValue([]);
  expect(await availablePair({ query } as unknown as EntityManager, 'service', interval))
    .toBeNull();
});

it('binds the interval and locks the recheck to the exact selected pair', async () => {
  const query = vi.fn().mockResolvedValue([pair]);
  expect(await availablePair(
    { query } as unknown as EntityManager, 'service', interval, pair,
  )).toEqual(pair);
  expect(query.mock.calls[0][1]).toEqual([
    'service', interval.startsAt, interval.endsAt, 'tech', 'bay',
  ]);
});
~~~

- [ ] **Step 2: Run the failing tests.**

~~~sh
pnpm --filter @keyloop-interview/api test src/bookings/available-pair.spec.ts
~~~

Expected: FAIL because the helper is not implemented.

- [ ] **Step 3: Implement the query.**

apps/api/src/bookings/available-pair.ts:

~~~ts
import type { EntityManager } from 'typeorm';
import type { Interval, ResourcePair } from './booking.types.js';

export async function availablePair(
  manager: EntityManager,
  serviceTypeId: string,
  interval: Interval,
  selected?: ResourcePair,
): Promise<ResourcePair | null> {
  const sql = [
    '/* available-pair */ SELECT t.id AS "technicianId", b.id AS "bayId"',
    'FROM scheduler.technicians t',
    'JOIN scheduler.technician_service_types q ON q.technician_id = t.id',
    'CROSS JOIN scheduler.service_bays b',
    'WHERE q.service_type_id = $1',
    'AND ($4::uuid IS NULL OR t.id = $4)',
    'AND ($5::uuid IS NULL OR b.id = $5)',
    'AND NOT EXISTS (SELECT 1 FROM scheduler.service_bookings booked',
    "WHERE booked.status = 'CONFIRMED'",
    'AND booked.starts_at < $3 AND booked.ends_at > $2',
    'AND (booked.technician_id = t.id OR booked.service_bay_id = b.id))',
    'ORDER BY t.id, b.id LIMIT 1',
  ].join(' ');
  const rows = await manager.query<ResourcePair[]>(sql, [
    serviceTypeId, interval.startsAt, interval.endsAt,
    selected?.technicianId ?? null, selected?.bayId ?? null,
  ]);
  return rows[0] ?? null;
}
~~~

Do not add FOR UPDATE to the first availability query and assume it rechecks a previously evaluated NOT EXISTS after waiting. Explicitly lock resource rows and issue this query again afterward as a separate statement.

- [ ] **Step 4: Run tests and typecheck.**

~~~sh
pnpm --filter @keyloop-interview/api test src/bookings/available-pair.spec.ts
pnpm --filter @keyloop-interview/api typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit.**

~~~sh
git add apps/api/src/bookings/available-pair.ts apps/api/src/bookings/available-pair.spec.ts
git commit -m "feat(api): query qualified resources for full service intervals"
~~~

## Task 5: Confirm bookings atomically with pessimistic resource locks

**Files:** Create apps/api/src/bookings/bookings.service.ts and bookings.service.spec.ts.

- [ ] **Step 1: Add service unit tests using a mocked database boundary.**

apps/api/src/bookings/bookings.service.spec.ts:

~~~ts
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { BookingsService } from './bookings.service.js';
import { ScheduleRules } from './schedule-rules.js';
import type { ResourcePair } from './booking.types.js';

const pair = { technicianId: 'tech-a', bayId: 'bay-a' };
const alternative = { technicianId: 'tech-b', bayId: 'bay-b' };
const catalog = { id: 'service', name: 'Inspection', durationMinutes: 60 };
const input = {
  name: ' Guest ', email: ' Guest@Example.com ', phoneNumber: '+84901234567',
  registrationNumber: ' ab-123 ', serviceTypeId: catalog.id,
  startsAt: '2030-01-02T10:00:00Z',
};

function fixture(answers: (ResourcePair | null)[] = [pair, pair]) {
  const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<unknown[]> => {
    if (sql.includes('set_config')) return [];
    if (sql.includes('FROM scheduler.service_types')) return [catalog];
    if (sql.includes('/* available-pair */')) {
      if (!answers.length) throw new Error('Unexpected availability query');
      const answer = answers.shift();
      return answer ? [answer] : [];
    }
    if (sql.endsWith('FOR UPDATE')) return [{ id: values[0] }];
    if (sql.startsWith('INSERT INTO scheduler.users')) return [];
    if (sql.startsWith('SELECT id FROM scheduler.users')) return [{ id: 'customer' }];
    if (sql.startsWith('INSERT INTO scheduler.vehicles')) return [];
    if (sql.startsWith('SELECT id FROM scheduler.vehicles')) return [{ id: 'vehicle' }];
    if (sql.startsWith('INSERT INTO scheduler.service_bookings')) {
      return [{
        id: 'booking', status: 'CONFIRMED', startsAt: values[5], endsAt: values[6],
      }];
    }
    throw new Error('Unexpected database operation');
  });
  const manager = { query };
  const transaction = vi.fn(async (
    _isolation: string, operation: (value: typeof manager) => Promise<unknown>,
  ) => operation(manager));
  const db = { transaction, manager, query } as unknown as DataSource;
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' })),
  });
  return { service: new BookingsService(db, rules), transaction, query };
}

describe('BookingsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('confirms a booking with normalized email and submitted contact snapshot', async () => {
    const { service, query } = fixture();
    const result = await service.create(input);
    expect(result).toMatchObject({
      id: 'booking', registrationNumber: 'AB-123',
      startsAt: '2030-01-02T10:00:00.000Z', endsAt: '2030-01-02T11:00:00.000Z',
    });
    expect(result).not.toHaveProperty('email');
    const insert = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO scheduler.service_bookings'));
    expect(insert?.[1]?.slice(7)).toEqual(['Guest', 'guest@example.com', '+84901234567']);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE scheduler.users'))).toBe(false);
  });

  it('locks technician then bay, and rechecks after both locks', async () => {
    const { service, query } = fixture();
    await service.create(input);
    const sql = query.mock.calls.map(([text]) => text);
    const tech = sql.findIndex(text => text.includes('scheduler.technicians') && text.endsWith('FOR UPDATE'));
    const bay = sql.findIndex(text => text.includes('scheduler.service_bays') && text.endsWith('FOR UPDATE'));
    const rechecks = sql.flatMap((text, index) => text.includes('/* available-pair */') ? [index] : []);
    expect(tech).toBeLessThan(bay);
    expect(rechecks[1]).toBeGreaterThan(bay);
  });

  it('returns 409 without contact writes when resources are unavailable', async () => {
    const { service, query } = fixture([null]);
    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });

  it('retries a pair lost while waiting and uses a fresh eligible pair', async () => {
    const { service, transaction, query } = fixture([pair, null, alternative, alternative]);
    await service.create(input);
    expect(transaction).toHaveBeenCalledTimes(2);
    const insert = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO scheduler.service_bookings'));
    expect(insert?.[1]?.slice(3, 5)).toEqual(['tech-b', 'bay-b']);
  });

  it.each(['40P01', '55P03'])('retries PostgreSQL contention %s', async code => {
    const { service, transaction } = fixture();
    transaction.mockRejectedValueOnce({ driverError: { code } });
    await expect(service.create(input)).resolves.toHaveProperty('id');
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('returns 503 after three transient failures', async () => {
    const { service, transaction } = fixture();
    transaction.mockRejectedValue({ driverError: { code: '40P01' } });
    await expect(service.create(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('propagates unexpected failures without retrying', async () => {
    const { service, transaction } = fixture();
    const failure = new Error('connection failed');
    transaction.mockRejectedValueOnce(failure);
    await expect(service.create(input)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('returns an availability preview without locks or writes', async () => {
    const { service, query, transaction } = fixture([null]);
    expect(await service.availability(input)).toMatchObject({ available: false });
    expect(transaction).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE') || sql.startsWith('INSERT')))
      .toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the service tests before adding the implementation.**

~~~sh
pnpm --filter @keyloop-interview/api test src/bookings/bookings.service.spec.ts
~~~

Expected: FAIL until the service exists and implements the requested outcomes. Do not interpret mock tests as proof of PostgreSQL isolation.

- [ ] **Step 3: Implement one transaction per confirmation attempt.**

apps/api/src/bookings/bookings.service.ts:

~~~ts
import {
  ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { Database } from '../database/database.js';
import { ScheduleRules } from './schedule-rules.js';
import { availablePair } from './available-pair.js';
import type {
  Availability, BookingInput, Confirmation, ServiceType,
} from './booking.types.js';

class CandidateChanged extends Error {}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(Database) private readonly db: DataSource,
    @Inject(ScheduleRules) private readonly rules: ScheduleRules,
  ) {}

  listServices(): Promise<ServiceType[]> {
    return this.db.query(
      'SELECT id, name, duration_minutes AS "durationMinutes" FROM scheduler.service_types ORDER BY name',
    );
  }

  private async serviceType(manager: EntityManager, id: string): Promise<ServiceType> {
    const rows = await manager.query<ServiceType[]>(
      'SELECT id, name, duration_minutes AS "durationMinutes" FROM scheduler.service_types WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Service type not found');
    return rows[0];
  }

  async availability(input: Pick<BookingInput, 'serviceTypeId' | 'startsAt'>): Promise<Availability> {
    const service = await this.serviceType(this.db.manager, input.serviceTypeId);
    const interval = this.rules.interval(input.startsAt, service.durationMinutes);
    const pair = await availablePair(this.db.manager, service.id, interval);
    return {
      serviceTypeId: service.id, date: interval.date,
      startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString(),
      available: pair !== null,
    };
  }

  async create(input: BookingInput): Promise<Confirmation> {
    const contact = {
      name: input.name.trim(), email: input.email.trim().toLowerCase(),
      phoneNumber: input.phoneNumber.trim(),
      registrationNumber: input.registrationNumber.trim().toUpperCase(),
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.transaction('READ COMMITTED', async manager => {
          await manager.query(
            "SELECT set_config('lock_timeout', '2s', true), " +
            "set_config('statement_timeout', '5s', true), " +
            "set_config('scheduler.timezone', $1, true)",
            [this.rules.schedule.timeZone],
          );
          const service = await this.serviceType(manager, input.serviceTypeId);
          const interval = this.rules.interval(input.startsAt, service.durationMinutes);
          const pair = await availablePair(manager, service.id, interval);
          if (!pair) throw new ConflictException('No qualified technician and bay are available');

          const tech = await manager.query<{ id: string }[]>(
            'SELECT id FROM scheduler.technicians WHERE id = $1 FOR UPDATE',
            [pair.technicianId],
          );
          const bays = await manager.query<{ id: string }[]>(
            'SELECT id FROM scheduler.service_bays WHERE id = $1 FOR UPDATE',
            [pair.bayId],
          );
          if (!tech.length || !bays.length ||
              !await availablePair(manager, service.id, interval, pair)) {
            throw new CandidateChanged();
          }
          this.rules.interval(input.startsAt, service.durationMinutes);

          await manager.query(
            'INSERT INTO scheduler.users (name, email, phone_number) VALUES ($1, $2, $3) ' +
            'ON CONFLICT (email) DO NOTHING',
            [contact.name, contact.email, contact.phoneNumber],
          );
          const [customer] = await manager.query<{ id: string }[]>(
            'SELECT id FROM scheduler.users WHERE email = $1', [contact.email],
          );
          await manager.query(
            'INSERT INTO scheduler.vehicles (user_id, registration_number) VALUES ($1, $2) ' +
            'ON CONFLICT (user_id, registration_number) DO NOTHING',
            [customer.id, contact.registrationNumber],
          );
          const [vehicle] = await manager.query<{ id: string }[]>(
            'SELECT id FROM scheduler.vehicles WHERE user_id = $1 AND registration_number = $2',
            [customer.id, contact.registrationNumber],
          );
          const [booking] = await manager.query<{
            id: string; status: 'CONFIRMED'; startsAt: Date; endsAt: Date;
          }[]>(
            'INSERT INTO scheduler.service_bookings ' +
            '(user_id, vehicle_id, service_type_id, technician_id, service_bay_id, starts_at, ends_at, ' +
            'submitted_name, submitted_email, submitted_phone_number) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ' +
            'RETURNING id, status, starts_at AS "startsAt", ends_at AS "endsAt"',
            [
              customer.id, vehicle.id, service.id, pair.technicianId, pair.bayId,
              interval.startsAt, interval.endsAt, contact.name, contact.email, contact.phoneNumber,
            ],
          );
          return {
            id: booking.id, service, registrationNumber: contact.registrationNumber,
            startsAt: booking.startsAt.toISOString(), endsAt: booking.endsAt.toISOString(),
            status: booking.status,
          };
        });
      } catch (error) {
        const failure = error as { driverError?: { code?: string }; code?: string };
        const code = failure?.driverError?.code ?? failure?.code;
        if (error instanceof CandidateChanged || code === '40P01' || code === '55P03') continue;
        throw error;
      }
    }
    throw new ServiceUnavailableException('Booking contention; retry confirmation');
  }
}
~~~

55P03 is a bounded row-lock wait timeout, treated as contention; 40P01 is a transaction deadlock. Resource absence gives 409 only after a fresh candidate query finds none. Retrying always starts a new transaction. A statement timeout or unrelated failure is not automatically retried.

The scheduler.timezone transaction setting is reserved for the second plan's database Broadcast trigger. It contains no secrets.

- [ ] **Step 4: Run all API unit tests, typecheck, and lint.**

~~~sh
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api lint
~~~

Expected: PASS. If Vitest mock overload inference rejects mockRejectedValueOnce, type the fake transaction's return as Promise<unknown>; do not weaken the production service types.

- [ ] **Step 5: Commit this service and its tests.**

~~~sh
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): confirm bookings with transactional resource row locks"
~~~

## Task 6: Seed the catalog and provide explicit local configuration

**Files:** Create apps/api/src/database/seed.ts, seed-catalog.sql, .env.example; modify package start scripts.

- [ ] **Step 1: Add this seed-idempotence test inside the existing scheduler schema describe block.**

~~~ts
it('seeds the catalog idempotently', async () => {
  const { seedCatalog } = await import('../src/database/seed.js');
  await db.transaction(seedCatalog);
  await db.transaction(seedCatalog);
  const [{ count }] = await db.query<{ count: string }[]>(
    'SELECT count(*) FROM scheduler.service_types',
  );
  expect(count).toBe('2');
});
~~~

Run pnpm --filter @keyloop-interview/api test:integration now. Expected: FAIL because seedCatalog is absent. After Step 2 the resulting catalog must contain exactly two fixture services on this dedicated database.

- [ ] **Step 2: Add the idempotent catalog SQL.**

apps/api/src/database/seed-catalog.sql:

~~~sql
INSERT INTO scheduler.service_types (id, name, duration_minutes) VALUES
('00000000-0000-4000-8000-000000000001', 'Oil change', 30),
('00000000-0000-4000-8000-000000000002', 'Inspection', 60)
ON CONFLICT (id) DO NOTHING;
INSERT INTO scheduler.technicians (id, name) VALUES
('00000000-0000-4000-8000-000000000011', 'Technician A'),
('00000000-0000-4000-8000-000000000012', 'Technician B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO scheduler.service_bays (id, name) VALUES
('00000000-0000-4000-8000-000000000021', 'Bay A'),
('00000000-0000-4000-8000-000000000022', 'Bay B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO scheduler.technician_service_types (technician_id, service_type_id) VALUES
('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;
~~~

apps/api/src/database/seed.ts:

~~~ts
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { EntityManager } from 'typeorm';

export async function seedCatalog(manager: EntityManager): Promise<void> {
  const sql = await readFile(new URL('./seed-catalog.sql', import.meta.url), 'utf8');
  await manager.query(sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: db } = await import('./data-source.js');
  await db.initialize();
  try {
    await db.transaction(seedCatalog);
  } finally {
    await db.destroy();
  }
}
~~~

This CLI only inserts absent resource fixtures. It never changes existing service durations or customer data.

- [ ] **Step 3: Add safe local environment values and native Node environment loading.**

apps/api/.env.example:

~~~dotenv
# Disposable local development only. Hosted operation needs real dealership values.
DATABASE_URL=postgresql://scheduler_test:test@127.0.0.1:54329/scheduler_dev
DEALERSHIP_TIMEZONE=UTC
# Monday through Sunday. null means closed.
DEALERSHIP_OPENING_HOURS=[{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},{"open":"09:00","close":"17:00"},null,null]
# For Supabase: absolute path to the downloaded database CA certificate.
PGSSLROOTCERT=
PORT=3000
~~~

~~~sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'apps/api/package.json';
const value = JSON.parse(readFileSync(path, 'utf8'));
const cli = 'node --env-file-if-exists=.env node_modules/@nestjs/cli/bin/nest.js';
Object.assign(value.scripts, {
  dev: cli + ' start --watch',
  start: cli + ' start',
  'start:dev': cli + ' start --watch',
  'start:debug': cli + ' start --debug --watch',
  'start:prod': 'node --env-file-if-exists=.env dist/main.js',
});
writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
JS
~~~

- [ ] **Step 4: Create a separate local development database, migrate it, and seed it.**

~~~sh
docker compose -f compose.scheduler-test.yaml exec -T postgres psql -U scheduler_test -d scheduler_test <<'SQL'
SELECT 'CREATE DATABASE scheduler_dev OWNER scheduler_test'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'scheduler_dev') \gexec
SQL
cp -n apps/api/.env.example apps/api/.env
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api migration:run
pnpm --filter @keyloop-interview/api db:seed
pnpm --filter @keyloop-interview/api test:integration
~~~

Expected: migration and seed succeed; seed test PASS. The integration guard still rejects scheduler_dev, so tests cannot truncate manual development bookings.

For Supabase, the developer supplies a direct or session-pooler URL and a CA certificate in ignored apps/api/.env. Never copy the local fixture credentials to a hosted role or print the actual URL. Hosted migrations and catalog seeding are run only against the explicitly selected project.

- [ ] **Step 5: Commit this task's files.**

~~~sh
git add apps/api/src/database/seed.ts apps/api/src/database/seed-catalog.sql apps/api/.env.example apps/api/test/database.integration-spec.ts apps/api/package.json
git commit -m "feat(api): add idempotent service catalog and local configuration"
~~~

## Task 7: Expose validated HTTP routes

**Files:** Create bookings.dto.ts, bookings.dto.spec.ts, bookings.controller.ts, configure-app.ts, and test/bookings.e2e-spec.ts; modify app.module.ts, main.ts, and original root HTTP test.

- [ ] **Step 1: Add HTTP contract tests before routes are implemented.**

apps/api/test/bookings.e2e-spec.ts:

~~~ts
import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Database } from '../src/database/database.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { configureApp } from '../src/configure-app.js';

const serviceId = '00000000-0000-4000-8000-000000000001';
const payload = {
  name: ' Guest ', email: ' Guest@Example.com ', phoneNumber: '+84901234567',
  registrationNumber: ' AB-123 ', serviceTypeId: serviceId,
  startsAt: '2030-01-02T10:00:00Z',
};

describe('guest booking HTTP contracts', () => {
  let app: INestApplication;
  const service = {
    listServices: vi.fn(),
    availability: vi.fn(),
    create: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Database).useValue({})
      .overrideProvider(ScheduleRules).useValue({})
      .overrideProvider(BookingsService).useValue(service)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    service.listServices.mockResolvedValue([{ id: serviceId, name: 'Oil change', durationMinutes: 30 }]);
    service.availability.mockResolvedValue({ available: true });
    service.create.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
      registrationNumber: 'AB-123', status: 'CONFIRMED',
      startsAt: '2030-01-02T10:00:00.000Z', endsAt: '2030-01-02T10:30:00.000Z',
      service: { id: serviceId, name: 'Oil change', durationMinutes: 30 },
    });
  });
  afterAll(async () => { await app.close(); });

  it('lists services', async () => {
    const response = await request(app.getHttpServer()).get('/service-types').expect(200);
    expect(response.body[0]).toMatchObject({ id: serviceId, durationMinutes: 30 });
  });

  it('creates a guest booking without exposing customer details', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-bookings').send(payload).expect(201);
    expect(response.body.status).toBe('CONFIRMED');
    expect(response.body).not.toHaveProperty('email');
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Guest', email: 'guest@example.com', registrationNumber: 'AB-123',
    }));
  });

  it.each([
    { ...payload, email: 'invalid' },
    { ...payload, name: ' ' },
    { ...payload, phoneNumber: 'letters' },
    { ...payload, registrationNumber: '' },
    { ...payload, technicianId: serviceId },
    { ...payload, userId: serviceId },
  ])('rejects invalid or client-assigned fields', async invalid => {
    await request(app.getHttpServer()).post('/service-bookings').send(invalid).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('validates availability input', async () => {
    await request(app.getHttpServer()).get('/availability')
      .query({ serviceTypeId: 'bad', startsAt: payload.startsAt }).expect(400);
    expect(service.availability).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/availability')
      .query({ serviceTypeId: serviceId, startsAt: payload.startsAt }).expect(200);
  });

  it('returns a booking conflict without existing customer data', async () => {
    service.create.mockRejectedValueOnce(new ConflictException('No resources available'));
    const response = await request(app.getHttpServer())
      .post('/service-bookings').send(payload).expect(409);
    expect(response.body).not.toHaveProperty('email');
  });

  it('does not expose customer or booking-history searches', async () => {
    await request(app.getHttpServer()).get('/users').expect(404);
    await request(app.getHttpServer()).get('/service-bookings')
      .query({ email: payload.email }).expect(404);
  });
});
~~~

Run:

~~~sh
pnpm --filter @keyloop-interview/api test:e2e
~~~

Expected: FAIL because the booking routes/configuration are not implemented. Existing root GET behavior must still pass after its test is isolated below.

- [ ] **Step 2: Implement the DTOs and shared validation configuration.**

apps/api/src/bookings/bookings.dto.ts:

~~~ts
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail, IsISO8601, IsString, IsUUID, Matches, MaxLength, MinLength,
} from 'class-validator';

function trim({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class AvailabilityQuery {
  @IsUUID('4')
  serviceTypeId!: string;

  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  startsAt!: string;
}

export class CreateBookingDto extends AvailabilityQuery {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(30)
  @Matches(/^\+?[0-9][0-9 ()-]{5,28}[0-9]$/)
  phoneNumber!: string;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  registrationNumber!: string;
}
~~~

apps/api/src/configure-app.ts:

~~~ts
import { ValidationPipe, type INestApplication } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
}
~~~

apps/api/src/bookings/bookings.dto.spec.ts:

~~~ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBookingDto } from './bookings.dto.js';

it('normalizes a guest request and rejects an incomplete email', async () => {
  const input = {
    name: ' Guest ', email: ' Guest@Example.com ', phoneNumber: '+84901234567',
    registrationNumber: ' ab-123 ',
    serviceTypeId: '00000000-0000-4000-8000-000000000001',
    startsAt: '2030-01-02T10:00:00Z',
  };
  const dto = plainToInstance(CreateBookingDto, input);
  expect(await validate(dto)).toHaveLength(0);
  expect(dto.email).toBe('guest@example.com');
  expect(dto.registrationNumber).toBe('AB-123');
  expect(await validate(plainToInstance(CreateBookingDto, { ...input, email: 'guest@' })))
    .not.toHaveLength(0);
});
~~~

During execution, write and run this DTO test before implementing bookings.dto.ts as well.

- [ ] **Step 3: Implement the controller and wire the application.**

apps/api/src/bookings/bookings.controller.ts:

~~~ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { AvailabilityQuery, CreateBookingDto } from './bookings.dto.js';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('service-types')
  listServices() { return this.bookings.listServices(); }

  @Get('availability')
  availability(@Query() query: AvailabilityQuery) {
    return this.bookings.availability(query);
  }

  @Post('service-bookings')
  create(@Body() input: CreateBookingDto) {
    return this.bookings.create(input);
  }
}
~~~

apps/api/src/app.module.ts:

~~~ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { Database } from './database/database.js';
import { ScheduleRules, readSchedule } from './bookings/schedule-rules.js';
import { BookingsService } from './bookings/bookings.service.js';
import { BookingsController } from './bookings/bookings.controller.js';

@Module({
  controllers: [AppController, BookingsController],
  providers: [
    AppService, Database, BookingsService,
    { provide: ScheduleRules, useFactory: () => new ScheduleRules(readSchedule()) },
  ],
})
export class AppModule {}
~~~

apps/api/src/main.ts:

~~~ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create(AppModule);
configureApp(app);
app.enableShutdownHooks();
await app.listen(process.env.PORT ?? 3000);
~~~

Replace apps/api/test/app.e2e-spec.ts with this database-independent root-route test:

~~~ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../src/app.controller.js';
import { AppService } from '../src/app.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  afterEach(async () => { await app.close(); });
});
~~~

- [ ] **Step 4: Run HTTP tests, unit tests, and the build.**

~~~sh
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api lint
~~~

Expected: all PASS. The HTTP suite uses overridden providers; hosted credentials must not be required.

- [ ] **Step 5: Commit only the exact route/configuration files.**

~~~sh
git add apps/api/src/bookings/bookings.dto.ts apps/api/src/bookings/bookings.dto.spec.ts apps/api/src/bookings/bookings.controller.ts apps/api/src/configure-app.ts apps/api/src/app.module.ts apps/api/src/main.ts apps/api/test/bookings.e2e-spec.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): expose validated anonymous booking endpoints"
~~~

## Task 8: Prove allocation, rollback, and concurrency with real PostgreSQL

**Files:** Create apps/api/test/bookings.integration-spec.ts. Use only the guarded local scheduler_test database from Task 2.

- [ ] **Step 1: Add integration tests with deterministic lock barriers.**

apps/api/test/bookings.integration-spec.ts:

~~~ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

const oil = '00000000-0000-4000-8000-000000000001';
const inspection = '00000000-0000-4000-8000-000000000002';
const techA = '00000000-0000-4000-8000-000000000011';
const bayA = '00000000-0000-4000-8000-000000000021';
const bayB = '00000000-0000-4000-8000-000000000022';
const base = DateTime.utc().plus({ days: 1 }).startOf('day').plus({ hours: 10 });
const at = (minutes = 0) => base.plus({ minutes }).toISO()!;

describe('booking persistence and resource locking', () => {
  const db = testDatabase();
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' })),
  });
  const service = new BookingsService(db, rules);
  const input = (email: string, serviceTypeId = oil, minutes = 0) => ({
    name: 'Guest', email, phoneNumber: '+84901234567',
    registrationNumber: email.split('@')[0], serviceTypeId, startsAt: at(minutes),
  });

  beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE scheduler.service_bookings, scheduler.vehicles, scheduler.users, ' +
      'scheduler.technician_service_types, scheduler.technicians, ' +
      'scheduler.service_bays, scheduler.service_types',
    );
    await db.transaction(seedCatalog);
  });
  afterAll(async () => { if (db.isInitialized) await db.destroy(); });

  async function hold(table: 'technicians' | 'service_bays', id: string) {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SELECT id FROM scheduler.' + table + ' WHERE id = $1 FOR UPDATE', [id]);
    return async () => {
      try { await runner.commitTransaction(); }
      finally { await runner.release(); }
    };
  }

  async function waiterCount(table: string): Promise<number> {
    const [row] = await db.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM pg_stat_activity ' +
      "WHERE datname = current_database() AND application_name = 'appointment-scheduler' " +
      "AND wait_event_type = 'Lock' AND query LIKE $1",
      ['%scheduler.' + table + '%FOR UPDATE%'],
    );
    return row.count;
  }

  async function waitForWaiters(table: string, expected: number): Promise<void> {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      if (await waiterCount(table) >= expected) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected PostgreSQL row-lock waiters did not appear');
  }

  it('persists all associations and the fixed service interval', async () => {
    const result = await service.create(input('first@example.com'));
    const [row] = await db.query(
      'SELECT b.*, u.email, v.registration_number FROM scheduler.service_bookings b ' +
      'JOIN scheduler.users u ON u.id=b.user_id JOIN scheduler.vehicles v ON v.id=b.vehicle_id ' +
      'JOIN scheduler.technicians t ON t.id=b.technician_id ' +
      'JOIN scheduler.service_bays bay ON bay.id=b.service_bay_id ' +
      'JOIN scheduler.service_types s ON s.id=b.service_type_id WHERE b.id=$1', [result.id],
    );
    expect(row.email).toBe('first@example.com');
    expect(row.registration_number).toBe('FIRST');
    expect(row.ends_at.getTime() - row.starts_at.getTime()).toBe(30 * 60_000);
    expect(result).not.toHaveProperty('submittedEmail');
  });

  it('reuses normalized email without overwriting contact details', async () => {
    await service.create(input('guest@example.com'));
    await service.create({
      ...input(' Guest@Example.com ', oil, 60),
      name: 'Different submitted name', phoneNumber: '+84909999999',
      registrationNumber: 'SECOND',
    });
    const customers = await db.query('SELECT name, email, phone_number FROM scheduler.users');
    expect(customers).toEqual([{
      name: 'Guest', email: 'guest@example.com', phone_number: '+84901234567',
    }]);
    const [snapshot] = await db.query(
      "SELECT submitted_name, submitted_phone_number FROM scheduler.service_bookings WHERE submitted_name = $1",
      ['Different submitted name'],
    );
    expect(snapshot.submitted_phone_number).toBe('+84909999999');
  });

  it('enforces normalized email and uniqueness in PostgreSQL', async () => {
    await service.create(input('unique@example.com'));
    await expect(db.query(
      'INSERT INTO scheduler.users (name,email,phone_number) VALUES ($1,$2,$3)',
      ['Guest', 'unique@example.com', '+84901234567'],
    )).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(db.query(
      'INSERT INTO scheduler.users (name,email,phone_number) VALUES ($1,$2,$3)',
      ['Guest', 'UPPER@example.com', '+84901234567'],
    )).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('rejects a service without any qualified technician', async () => {
    await db.query('DELETE FROM scheduler.technician_service_types WHERE service_type_id=$1', [oil]);
    await expect(service.create(input('unqualified@example.com')))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the technician is occupied although another bay is free', async () => {
    await service.create(input('occupied@example.com'));
    await expect(service.create(input('next@example.com', oil, 15)))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the only bay is occupied although a qualified technician is free', async () => {
    await db.query('DELETE FROM scheduler.service_bays WHERE id=$1', [bayB]);
    await service.create(input('occupant@example.com', inspection));
    await expect(service.create(input('oil@example.com'))).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    { minutes: 0, duration: 30 },
    { minutes: -15, duration: 30 },
    { minutes: 15, duration: 30 },
    { minutes: 5, duration: 10 },
    { minutes: -15, duration: 60 },
  ])('rejects overlapping interval $minutes / $duration', async ({ minutes, duration }) => {
    await service.create(input('existing@example.com'));
    await db.query('UPDATE scheduler.service_types SET duration_minutes=$1 WHERE id=$2', [duration, oil]);
    expect(await service.availability({ serviceTypeId: oil, startsAt: at(minutes) }))
      .toMatchObject({ available: false });
  });

  it('allows back-to-back bookings and preserves the original end after a duration change', async () => {
    const first = await service.create(input('first@example.com'));
    await db.query('UPDATE scheduler.service_types SET duration_minutes=60 WHERE id=$1', [oil]);
    const next = await service.create(input('second@example.com', oil, 30));
    expect(first.endsAt).toBe(next.startsAt);
    const [stored] = await db.query('SELECT ends_at FROM scheduler.service_bookings WHERE id=$1', [first.id]);
    expect(stored.ends_at.toISOString()).toBe(first.endsAt);
  });

  it('returns 404 for a service that does not exist', async () => {
    await expect(service.create(input(
      'missing@example.com', '00000000-0000-4000-8000-000000000099',
    ))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back contact and vehicle inserts when booking insertion fails', async () => {
    await db.query(
      "CREATE FUNCTION scheduler.reject_test_booking() RETURNS trigger LANGUAGE plpgsql " +
      "AS $$ BEGIN RAISE EXCEPTION 'fixture insertion failure'; END; $$",
    );
    await db.query(
      'CREATE TRIGGER reject_test_booking BEFORE INSERT ON scheduler.service_bookings ' +
      'FOR EACH ROW EXECUTE FUNCTION scheduler.reject_test_booking()',
    );
    try {
      await expect(service.create(input('rollback@example.com'))).rejects.toThrow();
      for (const table of ['users', 'vehicles', 'service_bookings']) {
        const [{ count }] = await db.query('SELECT count(*)::int AS count FROM scheduler.' + table);
        expect(count).toBe(0);
      }
    } finally {
      await db.query('DROP TRIGGER reject_test_booking ON scheduler.service_bookings');
      await db.query('DROP FUNCTION scheduler.reject_test_booking()');
    }
  });

  it('allows only one of two simultaneous confirmations for one resource pair', async () => {
    await db.query('DELETE FROM scheduler.service_bays WHERE id=$1', [bayB]);
    const release = await hold('technicians', techA);
    const pending = Promise.allSettled([
      service.create(input('a@example.com')), service.create(input('b@example.com')),
    ]);
    try { await waitForWaiters('technicians', 2); }
    finally { await release(); await pending; }
    const results = await pending;
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(result => result.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(ConflictException);
  });

  it('protects a shared bay even when technicians differ', async () => {
    await db.query('DELETE FROM scheduler.service_bays WHERE id=$1', [bayB]);
    const release = await hold('service_bays', bayA);
    const pending = Promise.allSettled([
      service.create(input('a@example.com', oil)),
      service.create(input('b@example.com', inspection)),
    ]);
    try { await waitForWaiters('service_bays', 2); }
    finally { await release(); await pending; }
    expect((await pending).filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('protects a shared technician even when candidate bays differ', async () => {
    await db.query('UPDATE scheduler.service_types SET duration_minutes=30 WHERE id=$1', [inspection]);
    await service.create(input('fixture1@example.com', inspection, 0));
    const second = await service.create(input('fixture2@example.com', inspection, 60));
    await db.query('UPDATE scheduler.service_bookings SET service_bay_id=$1 WHERE id=$2', [bayB, second.id]);
    await db.query('UPDATE scheduler.service_types SET duration_minutes=60 WHERE id=$1', [oil]);
    const release = await hold('technicians', techA);
    const pending = Promise.allSettled([
      service.create(input('a@example.com', oil, 0)),
      service.create(input('b@example.com', oil, 30)),
    ]);
    try { await waitForWaiters('technicians', 2); }
    finally { await release(); await pending; }
    expect((await pending).filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('lets unrelated resources complete while another technician is locked', async () => {
    const release = await hold('technicians', techA);
    const pending = Promise.allSettled([service.create(input('waiting@example.com', oil))]);
    try {
      await waitForWaiters('technicians', 1);
      await expect(service.create(input('independent@example.com', inspection)))
        .resolves.toHaveProperty('id');
      expect(await waiterCount('technicians')).toBeGreaterThan(0);
    } finally {
      await release();
      await pending;
    }
    expect((await pending)[0].status).toBe('fulfilled');
  });

  it('reuses a customer during concurrent confirmations without uniqueness errors', async () => {
    const results = await Promise.all([
      service.create(input('same@example.com', oil)),
      service.create({ ...input(' SAME@EXAMPLE.COM ', inspection), registrationNumber: 'SECOND' }),
    ]);
    expect(results).toHaveLength(2);
    const [{ count }] = await db.query('SELECT count(*)::int AS count FROM scheduler.users');
    expect(count).toBe(1);
  });
});
~~~

- [ ] **Step 2: Run the integration suite.**

~~~sh
pnpm --filter @keyloop-interview/api test:integration
~~~

Expected: all PASS against actual PostgreSQL. The barrier tests require visible lock waiters before releasing the held row. A Promise.all-only test without this barrier is not an adequate replacement.

- [ ] **Step 3: Inspect the final database state for overlapping reservations.**

~~~sh
docker compose -f compose.scheduler-test.yaml exec -T postgres psql -U scheduler_test -d scheduler_test <<'SQL'
SELECT count(*) AS conflicting_pairs
FROM scheduler.service_bookings a
JOIN scheduler.service_bookings b ON a.id < b.id
AND a.starts_at < b.ends_at AND a.ends_at > b.starts_at
AND (a.technician_id = b.technician_id OR a.service_bay_id = b.service_bay_id);
SQL
~~~

Expected: conflicting_pairs = 0. This is supplemental evidence, not a substitute for the race tests.

- [ ] **Step 4: Run all API checks once.**

~~~sh
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api test:integration
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api lint
~~~

Expected: PASS. If a test reveals a service defect, add the smallest unit regression for that defect before changing production logic.

- [ ] **Step 5: Commit the integration tests.**

~~~sh
git add apps/api/test/bookings.integration-spec.ts
git commit -m "test(api): prove booking rollback and concurrent resource allocation"
~~~

## Task 9: Document operation and verify the running backend

**Files:** Modify apps/api/README.md and root README.md.

- [ ] **Step 1: Replace apps/api/README.md with the following operator documentation.**

~~~markdown
# Appointment Scheduler API

Guest booking for one dealership. Supabase hosts PostgreSQL; NestJS owns booking
validation and persistence. No customer login is required.

## Local setup

From the repository root:

1. Run pnpm install.
2. Run docker compose -f compose.scheduler-test.yaml up -d --wait.
3. Create scheduler_dev using the database-creation command in the implementation plan.
4. Copy apps/api/.env.example to apps/api/.env without overwriting existing configuration.
5. Run pnpm --filter @keyloop-interview/api build.
6. Run pnpm --filter @keyloop-interview/api migration:run.
7. Run pnpm --filter @keyloop-interview/api db:seed.
8. Run pnpm --filter @keyloop-interview/api dev.

Configure dealership timezone and seven opening-hour entries, Monday to Sunday.
null means closed. The examples are development fixtures, not actual dealership
hours. Service durations are fixed in minutes.

## Supabase

Store the selected project's PostgreSQL URL in the server's DATABASE_URL.
For a persistent IPv4-only server, select the session pooler connection; otherwise
use a direct connection when networking supports it. Supply PGSSLROOTCERT as the
absolute path to the database CA certificate. TLS verification stays enabled.

Customer and booking tables live in scheduler, outside the Data API exposed
schemas. Do not grant browser roles direct reads or writes. Do not commit .env
files or place database credentials in VITE_ variables.

## HTTP contracts

GET /service-types returns id, name, and durationMinutes for each service.

GET /availability accepts serviceTypeId and startsAt query parameters and returns
serviceTypeId, dealership-local date, startsAt, endsAt, and available.
startsAt must contain Z or a timezone offset.

POST /service-bookings accepts:
name, email, phoneNumber, registrationNumber, serviceTypeId, startsAt.

Successful confirmation returns 201 with id, service, registrationNumber,
startsAt, endsAt, and CONFIRMED status. It does not return customer details.

400 means invalid input, past time, or outside opening hours.
404 means unknown service type.
409 means no qualified technician/bay pair is available.
503 means repeated allocation contention; the caller may retry confirmation.

Email is trimmed and lowercased, then enforced unique in PostgreSQL. Existing
customer details are never changed by a guest submission. Submitted contact
details are preserved on each booking. Email and registration are unverified
associations and do not grant access to earlier bookings.

## Double-booking protection

Each confirmation uses one READ COMMITTED transaction. It locks the selected
technician, then the bay, runs a separate full-duration availability query,
persists the booking, and commits. Every booking writer must follow this protocol.
Availability previews do not reserve capacity. Raw SQL that bypasses the protocol
is not protected by a no-overlap constraint in this version.

## Checks

pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api test:integration
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api lint

Copy .env.test.example to .env.test for integration tests. Tests require loopback
host and the exact scheduler_test database name; they truncate only that fixture.
Do not use a hosted database for these tests. scheduler_dev is separate.

Supabase Realtime is covered by the dependent Realtime implementation plan.
Cancellation, rescheduling, email/SMS notifications, and management CRUD are not
part of this version.
~~~

In root README.md, append this exact section without replacing existing UI documentation:

~~~markdown
## Appointment backend

See apps/api/README.md for local PostgreSQL setup, Supabase configuration, guest
booking contracts, and the unit/HTTP/integration test commands. Start the backend
with pnpm --filter @keyloop-interview/api dev after migrating its configured database.
~~~

- [ ] **Step 2: Start the compiled application against scheduler_dev.**

~~~sh
pnpm --filter @keyloop-interview/api start:prod
~~~

Expected: NestJS starts on port 3000 with validated schedule/database configuration.

- [ ] **Step 3: Verify a real HTTP booking using future fixture time.**

Run this in another terminal from the root:

~~~sh
node --input-type=module <<'JS'
const services = await fetch('http://127.0.0.1:3000/service-types').then(r => r.json());
const start = new Date();
start.setUTCDate(start.getUTCDate() + 1);
while ([0, 6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate() + 1);
start.setUTCHours(10, 0, 0, 0);
const response = await fetch('http://127.0.0.1:3000/service-bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Demo Guest', email: 'demo-' + Date.now() + '@example.com',
    phoneNumber: '+84901234567', registrationNumber: 'DEMO-' + Date.now(),
    serviceTypeId: services.find(s => s.name === 'Oil change').id,
    startsAt: start.toISOString(),
  }),
});
const body = await response.json();
if (response.status !== 201 || body.status !== 'CONFIRMED') {
  throw new Error('Booking smoke test did not confirm');
}
if ('email' in body || 'phoneNumber' in body) throw new Error('Private response fields');
console.log({ status: response.status, bookingId: body.id, startsAt: body.startsAt, endsAt: body.endsAt });
JS
~~~

This smoke command assumes the explicit UTC weekday development fixture. Do not reuse its date calculation for a dealership configured in another timezone. Stop the server after verification if it was started solely for the check.

- [ ] **Step 4: Run the workspace's existing checks after the API-specific checks pass.**

~~~sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
git diff --check
~~~

Expected: PASS, or report a concrete pre-existing failure separately. Do not change inventory-dashboard files or UI showcases to mask unrelated failures. Do not claim hosted Supabase or Realtime proof from local PostgreSQL results.

- [ ] **Step 5: Commit the documentation and report the evidence boundary.**

~~~sh
git add apps/api/README.md README.md
git diff --cached --check
git commit -m "docs(api): document booking operation and verification"
~~~

Report unit, HTTP, integration, and runtime results separately. Include the target database hostname/category without credentials. Proceed to the Realtime plan only after the backend's database tests and runtime smoke check pass.

## Self-review checklist

- [ ] Six domain entities plus qualifications: Task 2.
- [ ] Name/phone/email guest input and unique normalized email: Tasks 2, 5, 7, 8.
- [ ] Fixed duration and shared opening hours: Task 3.
- [ ] Full-interval bay/qualified-technician allocation: Tasks 4, 5, 8.
- [ ] Pessimistic resource locks, fresh recheck, bounded retries: Tasks 5 and 8.
- [ ] Persistent associations, atomic rollback, stable stored end time: Tasks 2, 5, 8.
- [ ] Existing customer privacy and booking contact snapshot: Tasks 5, 7, 8.
- [ ] Unit tests alongside code, real PostgreSQL races, HTTP contracts: Tasks 1–8.
- [ ] Local test/development separation, verified TLS, private schema: Tasks 1, 2, 6.
- [ ] Realtime delivery and browser resynchronization: dependent Realtime plan.
- [ ] No login, advisory locks, multi-dealership code, shifts, management CRUD, or unrelated UI rewrites.
- [ ] Review staged paths at every commit because the starting checkout includes untracked user work.

## Primary references

- NestJS validation: https://docs.nestjs.com/techniques/validation
- TypeORM transactions: https://typeorm.io/docs/advanced-topics/transactions/
- PostgreSQL row locks: https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
- PostgreSQL READ COMMITTED: https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED
- Supabase connections: https://supabase.com/docs/guides/database/connecting-to-postgres

This document is a plan, not a claim that its proposed code or tests have run.
