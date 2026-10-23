# Appointment Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh guest-facing appointment availability through Supabase Realtime without exposing customer or booking records.

**Architecture:** A transactional PostgreSQL trigger sends a date-only public Broadcast message after booking changes. The browser treats messages as invalidation hints and refetches the NestJS availability endpoint; resource locking remains responsible for confirmation correctness. A dedicated availability-monitor path proves this flow without replacing the existing UI preview.

**Tech Stack:** Core booking API from the linked backend plan; Supabase Realtime Broadcast; @supabase/supabase-js 2.118.0; existing React/Vite/shared UI components; Vitest.

---

## Prerequisites and boundaries

Workspace root: /Users/kai/works/side-project/keyloop-interview.

Complete /Users/kai/works/side-project/keyloop-interview/docs/superpowers/plans/2026-10-21-appointment-scheduler.md first. The backend must pass its unit, HTTP, real-PostgreSQL, and runtime checks.

Supabase connection credentials, a publishable browser key, a database CA certificate, and the actual dealership schedule must be supplied through ignored environment files for the live acceptance check. The plan can be implemented and unit-tested without them. Do not substitute a mock delivery result for a live Supabase result.

Do not expose scheduler tables in the Data API, add login, put customer details in events, change the inventory-dashboard spec, or replace the existing root component showcase. Public clients may send forged invalidation messages; these only schedule a bounded HTTP refetch and never update local availability directly.

This plan adds the Realtime transport and a small availability monitor, not a full customer-facing booking UI redesign. The API remains usable independently.

## File map

- Create apps/api/src/database/supabase-migrations/1792540800001-booking-realtime.ts and booking-realtime.sql.
- Create apps/api/src/database/supabase-data-source.ts; modify apps/api/package.json with a Supabase-specific migration command.
- Create apps/api/test/realtime-trigger.integration-spec.ts and test/realtime-stub.sql for local SQL contract/rollback tests.
- Modify apps/web/package.json for Supabase client and Vitest.
- Create apps/web/.env.example containing only browser-safe public values.
- Create apps/web/src/booking/watch-availability.ts and watch-availability.test.ts for the subscription lifecycle, refresh coalescing, error handling, reconnect, focus, and cleanup.
- Create apps/web/src/booking/public-realtime.ts and public-realtime.test.ts for validated public client initialization.
- Create apps/web/src/booking/AvailabilityMonitor.tsx for an isolated transport/availability demonstration.
- Modify apps/web/src/main.tsx only to mount the monitor at /appointments/availability.
- Modify apps/web/vite.config.ts to proxy /api requests to NestJS during development.
- Modify apps/api/README.md and root README.md with the event contract, environment values, and acceptance procedure.

## Task 1: Add transactional, sanitized database Broadcast

**Files:** Create the Supabase migration, SQL, and CLI data source; modify apps/api/package.json.

- [ ] **Step 1: Define the event contract and add the trigger contract test from Task 2 before implementing its SQL.**

Event: availability_changed.
Topic: availability:YYYY-MM-DD, interpreted in dealership local time.
Payload: exactly one date field. No booking IDs, resource IDs, names, emails, phone numbers, or registrations.

The core service already sets scheduler.timezone using set_config(..., true) inside the confirmation transaction. The trigger requires that setting instead of guessing a timezone. Any future booking mutation must do the same.

Run the Task 2 test once against the missing trigger to observe its contract assertion fail. Then implement the SQL below. The test's local realtime.send stub is not evidence of actual WebSocket delivery.

- [ ] **Step 2: Add the trigger SQL.**

apps/api/src/database/supabase-migrations/booking-realtime.sql:

~~~sql
DO $check$
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Supabase realtime.send is required';
  END IF;
END;
$check$;

CREATE FUNCTION scheduler.broadcast_availability_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  zone text := current_setting('scheduler.timezone', true);
  previous_date text;
  next_date text;
BEGIN
  IF zone IS NULL OR zone = '' THEN
    RAISE EXCEPTION 'scheduler.timezone must be set inside the booking transaction';
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.status = 'CONFIRMED' THEN
    previous_date := to_char(OLD.starts_at AT TIME ZONE zone, 'YYYY-MM-DD');
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.status = 'CONFIRMED' THEN
    next_date := to_char(NEW.starts_at AT TIME ZONE zone, 'YYYY-MM-DD');
  END IF;
  IF previous_date IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('date', previous_date),
      'availability_changed', 'availability:' || previous_date, false
    );
  END IF;
  IF next_date IS NOT NULL AND next_date IS DISTINCT FROM previous_date THEN
    PERFORM realtime.send(
      jsonb_build_object('date', next_date),
      'availability_changed', 'availability:' || next_date, false
    );
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION scheduler.broadcast_availability_change() FROM PUBLIC;

CREATE TRIGGER booking_availability_changed
AFTER INSERT OR UPDATE OR DELETE ON scheduler.service_bookings
FOR EACH ROW EXECUTE FUNCTION scheduler.broadcast_availability_change();
~~~

The function uses fully qualified application/Realtime objects and an empty search_path. It deliberately uses realtime.send with a custom payload, not broadcast_changes with NEW/OLD records. false means a public channel; it does not grant table access. There is no external network call inside the transaction: the database Broadcast mechanism writes to Supabase's transactional message path.

- [ ] **Step 3: Add the migration wrapper and separate hosted migration entrypoint.**

apps/api/src/database/supabase-migrations/1792540800001-booking-realtime.ts:

~~~ts
import { readFile } from 'node:fs/promises';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingRealtime1792540800001 implements MigrationInterface {
  name = 'BookingRealtime1792540800001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(await readFile(new URL('./booking-realtime.sql', import.meta.url), 'utf8'));
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TRIGGER IF EXISTS booking_availability_changed ON scheduler.service_bookings');
    await runner.query('DROP FUNCTION IF EXISTS scheduler.broadcast_availability_change()');
  }
}
~~~

apps/api/src/database/supabase-data-source.ts:

~~~ts
import { DataSource } from 'typeorm';
import { connectionOptions } from './connection-options.js';
import { InitialScheduler1792540800000 } from './migrations/1792540800000-initial-scheduler.js';
import { BookingRealtime1792540800001 } from './supabase-migrations/1792540800001-booking-realtime.js';

export default new DataSource({
  ...connectionOptions(),
  migrations: [InitialScheduler1792540800000, BookingRealtime1792540800001],
  migrationsTableName: 'appointment_scheduler_migrations',
});
~~~

~~~sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'apps/api/package.json';
const value = JSON.parse(readFileSync(path, 'utf8'));
value.scripts['migration:run:supabase'] =
  'node --env-file-if-exists=.env node_modules/typeorm/cli.js migration:run -d dist/database/supabase-data-source.js';
writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
JS
~~~

The SQL asset rule in the backend plan already copies this SQL into dist. Plain PostgreSQL fixtures keep using the core migration entrypoint, so they do not require Supabase internals.

- [ ] **Step 4: Run the SQL contract tests from Task 2 and build.**

~~~sh
pnpm --filter @keyloop-interview/api test:integration
pnpm --filter @keyloop-interview/api build
test -f apps/api/dist/database/supabase-migrations/booking-realtime.sql
~~~

Expected: local SQL tests PASS and the asset exists. Do not run migration:run:supabase against ordinary PostgreSQL without the explicitly guarded test stub.

- [ ] **Step 5: Commit the trigger and tooling.**

~~~sh
git add apps/api/src/database/supabase-migrations/1792540800001-booking-realtime.ts apps/api/src/database/supabase-migrations/booking-realtime.sql apps/api/src/database/supabase-data-source.ts apps/api/package.json
git commit -m "feat(api): broadcast sanitized availability changes transactionally"
~~~

## Task 2: Verify trigger payloads and transaction rollback locally

**Files:** Create apps/api/test/realtime-stub.sql and realtime-trigger.integration-spec.ts.

- [ ] **Step 1: Add the local-only transactional Broadcast stub.**

apps/api/test/realtime-stub.sql:

~~~sql
CREATE SCHEMA realtime;
CREATE TABLE realtime.test_outbox (
  payload jsonb NOT NULL,
  event text NOT NULL,
  topic text NOT NULL,
  private boolean NOT NULL
);
CREATE FUNCTION realtime.send(
  message_payload jsonb, message_event text, message_topic text, message_private boolean
) RETURNS void LANGUAGE sql AS $stub$
  INSERT INTO realtime.test_outbox (payload, event, topic, private)
  VALUES (message_payload, message_event, message_topic, message_private);
$stub$;
~~~

The guard in testDatabase requires loopback plus scheduler_test before this stub is installed. Never create or replace a realtime schema/function on a Supabase project; its real Realtime schema is managed by Supabase. A pre-existing realtime schema on this fixture should fail setup rather than be overwritten.

- [ ] **Step 2: Add complete trigger integration tests.**

apps/api/test/realtime-trigger.integration-spec.ts:

~~~ts
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import { testDatabase } from './database-fixture.js';
import { seedCatalog } from '../src/database/seed.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { BookingRealtime1792540800001 } from '../src/database/supabase-migrations/1792540800001-booking-realtime.js';

describe('availability trigger SQL contract', () => {
  const db = testDatabase();
  const migration = new BookingRealtime1792540800001();
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' })),
  });
  const service = new BookingsService(db, rules);
  const date = DateTime.utc().plus({ days: 2 }).startOf('day').plus({ hours: 10 });
  let installedStub = false;
  const input = {
    name: 'Private Guest', email: 'private@example.com', phoneNumber: '+84901234567',
    registrationNumber: 'PRIVATE-REG',
    serviceTypeId: '00000000-0000-4000-8000-000000000001',
    startsAt: date.toISO()!,
  };

  beforeAll(async () => {
    await db.initialize();
    await db.runMigrations();
    await db.transaction(async manager => {
      await manager.query(await readFile(new URL('./realtime-stub.sql', import.meta.url), 'utf8'));
    });
    installedStub = true;
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await migration.up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally { await runner.release(); }
  });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE scheduler.service_bookings, scheduler.vehicles, scheduler.users, ' +
      'scheduler.technician_service_types, scheduler.technicians, ' +
      'scheduler.service_bays, scheduler.service_types, realtime.test_outbox',
    );
    await db.transaction(seedCatalog);
  });
  afterAll(async () => {
    if (!db.isInitialized) return;
    if (!installedStub) { await db.destroy(); return; }
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await migration.down(runner);
      await runner.query('DROP FUNCTION realtime.send(jsonb,text,text,boolean)');
      await runner.query('DROP TABLE realtime.test_outbox');
      await runner.query('DROP SCHEMA realtime');
    } finally {
      await runner.release();
      await db.destroy();
    }
  });

  it('publishes exactly the public date-only event', async () => {
    await service.create(input);
    const messages = await db.query('SELECT payload,event,topic,private FROM realtime.test_outbox');
    expect(messages).toEqual([{
      payload: { date: date.toISODate() },
      event: 'availability_changed',
      topic: 'availability:' + date.toISODate(),
      private: false,
    }]);
    const encoded = JSON.stringify(messages);
    for (const secret of [input.name, input.email, input.phoneNumber, input.registrationNumber]) {
      expect(encoded).not.toContain(secret);
    }
  });

  it('rolls back the trigger message with the booking insertion', async () => {
    const first = await service.create(input);
    await db.query('TRUNCATE realtime.test_outbox');
    await expect(db.transaction(async manager => {
      await manager.query("SELECT set_config('scheduler.timezone', 'UTC', true)");
      await manager.query(
        'SELECT id FROM scheduler.technicians WHERE id=$1 FOR UPDATE',
        ['00000000-0000-4000-8000-000000000011'],
      );
      await manager.query(
        'SELECT id FROM scheduler.service_bays WHERE id=$1 FOR UPDATE',
        ['00000000-0000-4000-8000-000000000021'],
      );
      await manager.query(
        'INSERT INTO scheduler.service_bookings ' +
        '(user_id,vehicle_id,service_type_id,technician_id,service_bay_id,starts_at,ends_at,' +
        'submitted_name,submitted_email,submitted_phone_number) ' +
        "SELECT user_id,vehicle_id,service_type_id,technician_id,service_bay_id,starts_at+interval '1 day'," +
        "ends_at+interval '1 day',submitted_name,submitted_email,submitted_phone_number " +
        'FROM scheduler.service_bookings WHERE id=$1', [first.id],
      );
      throw new Error('rollback fixture');
    })).rejects.toThrow('rollback fixture');
    expect(await db.query('SELECT * FROM realtime.test_outbox')).toHaveLength(0);
    expect(await db.query('SELECT id FROM scheduler.service_bookings')).toHaveLength(1);
  });

  it('invalidates the old and new local dates when a booking is moved', async () => {
    const first = await service.create(input);
    await db.query('TRUNCATE realtime.test_outbox');
    await db.transaction(async manager => {
      await manager.query("SELECT set_config('scheduler.timezone', 'UTC', true)");
      await manager.query(
        'SELECT id FROM scheduler.technicians WHERE id=$1 FOR UPDATE',
        ['00000000-0000-4000-8000-000000000011'],
      );
      await manager.query(
        'SELECT id FROM scheduler.service_bays WHERE id=$1 FOR UPDATE',
        ['00000000-0000-4000-8000-000000000021'],
      );
      await manager.query(
        "UPDATE scheduler.service_bookings SET starts_at=starts_at+interval '1 day'," +
        "ends_at=ends_at+interval '1 day' WHERE id=$1", [first.id],
      );
    });
    const messages = await db.query('SELECT payload FROM realtime.test_outbox ORDER BY topic');
    expect(messages.map((row: { payload: { date: string } }) => row.payload.date)).toEqual([
      date.toISODate(), date.plus({ days: 1 }).toISODate(),
    ]);
  });
});
~~~

- [ ] **Step 3: Run this test before the trigger exists, then after Task 1.**

~~~sh
pnpm --filter @keyloop-interview/api test:integration test/realtime-trigger.integration-spec.ts
~~~

Expected RED: no date-only trigger event is produced before the trigger is installed. Expected GREEN: all three SQL contract tests PASS. The testDatabase helper must continue refusing hosted URLs.

- [ ] **Step 4: Re-run all backend checks and commit.**

~~~sh
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api test:integration
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api lint
git add apps/api/test/realtime-stub.sql apps/api/test/realtime-trigger.integration-spec.ts
git commit -m "test(api): verify sanitized transactional availability broadcasts"
~~~

Expected: PASS. Actual Supabase delivery remains a separate live acceptance check.

## Task 3: Implement and unit-test the browser subscription lifecycle

**Files:** Modify apps/web/package.json; create watch-availability.ts, watch-availability.test.ts, public-realtime.ts, and apps/web/.env.example.

- [ ] **Step 1: Install the public client and existing test-runner version.**

~~~sh
pnpm --filter @keyloop-interview/web add @supabase/supabase-js@2.118.0
pnpm --filter @keyloop-interview/web add -D vitest@4.1.12
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'apps/web/package.json';
const value = JSON.parse(readFileSync(path, 'utf8'));
value.scripts.test = 'vitest run';
writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
JS
~~~

No DOM test dependency is needed: the subscription helper accepts a native EventTarget so it can be tested with Node's built-in implementation.

- [ ] **Step 2: Add unit tests before implementing the helper.**

apps/web/src/booking/watch-availability.test.ts:

~~~ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { watchAvailability } from './watch-availability';

function fixture() {
  let receive: (message: { payload: unknown }) => void = () => {};
  let status: (value: string) => void = () => {};
  const channel = {
    on: vi.fn((_kind: string, _filter: unknown, callback: typeof receive) => {
      receive = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: typeof status) => {
      status = callback;
      return channel;
    }),
  };
  const removeChannel = vi.fn().mockResolvedValue('ok');
  const client = { channel: vi.fn(() => channel), removeChannel } as unknown as SupabaseClient;
  const refresh = vi.fn(async () => {});
  const onConnection = vi.fn();
  const onError = vi.fn();
  const target = new EventTarget();
  const stop = watchAvailability(client, '2030-01-02', {
    refresh, onConnection, onError,
  }, target);
  return {
    refresh, onConnection, onError, removeChannel, target, stop,
    status: (value: string) => status(value),
    receive: (payload: unknown) => receive({ payload }),
  };
}

describe('watchAvailability', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fetches a fresh snapshot after subscribing', async () => {
    const f = fixture();
    expect(f.refresh).not.toHaveBeenCalled();
    f.status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.onConnection).toHaveBeenLastCalledWith(true);
    f.stop();
  });

  it('coalesces date-only events and ignores other dates or row-shaped payloads', async () => {
    const f = fixture();
    f.receive({ date: '2030-01-03' });
    f.receive({ date: '2030-01-02', email: 'private@example.com' });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).not.toHaveBeenCalled();
    for (let n = 0; n < 10; n++) f.receive({ date: '2030-01-02' });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.stop();
  });

  it('refetches after reconnection and focus', async () => {
    const f = fixture();
    f.status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(200);
    f.status('CHANNEL_ERROR');
    expect(f.onConnection).toHaveBeenLastCalledWith(false);
    f.status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(200);
    f.target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(3);
    f.stop();
  });

  it('cleans up pending work, focus listeners, and its channel', async () => {
    const f = fixture();
    f.receive({ date: '2030-01-02' });
    f.stop();
    f.target.dispatchEvent(new Event('focus'));
    f.status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('refreshes again if an event arrives while the HTTP request is in flight', async () => {
    const f = fixture();
    let resolve: () => void = () => {};
    f.refresh.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    f.status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(200);
    f.receive({ date: '2030-01-02' });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    f.stop();
  });

  it('reports refresh errors and remains usable for a later refresh', async () => {
    const f = fixture();
    const error = new Error('network unavailable');
    f.refresh.mockRejectedValueOnce(error);
    f.status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(200);
    expect(f.onError).toHaveBeenCalledWith(error);
    f.target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    f.stop();
  });
});
~~~

Also add the public-client configuration unit tests before its implementation:

apps/web/src/booking/public-realtime.test.ts:

~~~ts
import { afterEach, expect, it, vi } from 'vitest';
import { publicRealtimeClient } from './public-realtime';

afterEach(() => vi.unstubAllEnvs());

it('refuses missing public configuration', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
  expect(() => publicRealtimeClient()).toThrow('publishable browser key');
});

it('refuses a secret key in browser configuration', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_example');
  expect(() => publicRealtimeClient()).toThrow('publishable browser key');
});
~~~

Never include a real secret in the test fixture.


Run:

~~~sh
pnpm --filter @keyloop-interview/web test src/booking/watch-availability.test.ts src/booking/public-realtime.test.ts
~~~

Expected: FAIL before the helper exists.

- [ ] **Step 3: Implement coalesced invalidation, snapshot refresh, and cleanup.**

apps/web/src/booking/watch-availability.ts:

~~~ts
import type { SupabaseClient } from '@supabase/supabase-js';

interface Callbacks {
  refresh: () => Promise<void>;
  onConnection: (connected: boolean) => void;
  onError: (error: unknown) => void;
}

export function watchAvailability(
  client: SupabaseClient,
  date: string,
  callbacks: Callbacks,
  target: EventTarget = window,
): () => void {
  let disposed = false;
  let pending = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function run(): Promise<void> {
    timer = undefined;
    if (disposed) return;
    if (pending) { dirty = true; return; }
    pending = true;
    try {
      await callbacks.refresh();
    } catch (error) {
      if (!disposed) callbacks.onError(error);
    } finally {
      pending = false;
      if (dirty && !disposed) {
        dirty = false;
        queue();
      }
    }
  }

  function queue(): void {
    if (!disposed && timer === undefined) {
      timer = setTimeout(() => { void run(); }, 200);
    }
  }

  const channel = client.channel('availability:' + date, { config: { private: false } })
    .on('broadcast', { event: 'availability_changed' }, ({ payload }) => {
      if (payload && typeof payload === 'object' &&
          Object.keys(payload).length === 1 && payload.date === date) queue();
    })
    .subscribe(status => {
      if (disposed) return;
      callbacks.onConnection(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') queue();
    });

  target.addEventListener('focus', queue);
  return () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    target.removeEventListener('focus', queue);
    void client.removeChannel(channel).catch(error => {
      console.warn('Realtime channel cleanup failed', error);
    });
  };
}
~~~

The helper never receives a booking object or marks a slot available/unavailable from a Broadcast. A valid public event only schedules an HTTP refresh. Coalescing is bounded to 200 ms rather than resetting the timer on every event.

apps/web/src/booking/public-realtime.ts:

~~~ts
import { createClient } from '@supabase/supabase-js';

export function publicRealtimeClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !key.startsWith('sb_publishable_')) {
    throw new Error('Configure the Supabase URL and publishable browser key');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
~~~

apps/web/.env.example:

~~~dotenv
# Copy the actual project URL and publishable key from Supabase Connect.
# These example strings are deliberately not working credentials.
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example
~~~

Never put DATABASE_URL or a secret/server key in any VITE_ variable. No Supabase Auth account/session is created by this flow.

- [ ] **Step 4: Run client unit tests and typecheck.**

~~~sh
pnpm --filter @keyloop-interview/web test
pnpm --filter @keyloop-interview/web typecheck
~~~

Expected: PASS. These prove subscription behavior using a fake transport, not actual Supabase delivery.

- [ ] **Step 5: Commit the exact transport files.**

~~~sh
git add apps/web/package.json pnpm-lock.yaml apps/web/.env.example apps/web/src/booking/watch-availability.ts apps/web/src/booking/watch-availability.test.ts apps/web/src/booking/public-realtime.ts apps/web/src/booking/public-realtime.test.ts
git commit -m "feat(web): subscribe to safe realtime availability invalidations"
~~~

## Task 4: Add an isolated availability monitor using existing UI controls

**Files:** Create apps/web/src/booking/AvailabilityMonitor.tsx; modify apps/web/src/main.tsx and apps/web/vite.config.ts.

- [ ] **Step 1: Add the monitor component.**

apps/web/src/booking/AvailabilityMonitor.tsx:

~~~tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@keyloop-interview/ui/components/button';
import { Input } from '@keyloop-interview/ui/components/input';
import { Label } from '@keyloop-interview/ui/components/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@keyloop-interview/ui/components/select';
import { publicRealtimeClient } from './public-realtime';
import { watchAvailability } from './watch-availability';

interface Service { id: string; name: string; durationMinutes: number }
interface Snapshot {
  serviceTypeId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
}
interface Selection { serviceTypeId: string; startsAt: string }

export function AvailabilityMonitor() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/service-types', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load services');
        const rows = await response.json() as Service[];
        setServices(rows);
        setServiceTypeId(rows[0]?.id ?? '');
      })
      .catch(failure => {
        if (!controller.signal.aborted) setError(String(failure.message ?? failure));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selection) return;
    let active = true;
    let stop: (() => void) | undefined;
    let request: AbortController | undefined;

    function report(failure: unknown) {
      if (!active || (failure instanceof DOMException && failure.name === 'AbortError')) return;
      setSnapshot(null);
      setError(failure instanceof Error ? failure.message : 'Unable to refresh availability');
    }

    async function refresh(): Promise<void> {
      request?.abort();
      request = new AbortController();
      const query = new URLSearchParams({
        serviceTypeId: selection!.serviceTypeId,
        startsAt: selection!.startsAt,
      });
      const response = await fetch('/api/availability?' + query, { signal: request.signal });
      if (!response.ok) {
        throw new Error('Availability check failed (' + response.status + '). Check the selected time.');
      }
      const value = await response.json() as Snapshot;
      if (!active) return;
      setSnapshot(value);
      setError('');
      if (!stop) {
        stop = watchAvailability(publicRealtimeClient(), value.date, {
          refresh, onConnection: setConnected, onError: report,
        });
      }
    }

    setConnected(false);
    setSnapshot(null);
    setError('');
    void refresh().catch(report);
    return () => {
      active = false;
      request?.abort();
      stop?.();
    };
  }, [selection]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = new Date(localTime);
    if (!Number.isFinite(start.getTime())) {
      setError('Choose a valid start time');
      return;
    }
    setSelection({ serviceTypeId, startsAt: start.toISOString() });
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Appointment availability</h1>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="appointment-service">Service</Label>
          <Select value={serviceTypeId} onValueChange={value => {
            setServiceTypeId(value); setSelection(null); setSnapshot(null); setConnected(false);
          }} disabled={!services.length}>
            <SelectTrigger id="appointment-service"><SelectValue placeholder="Select a service" /></SelectTrigger>
            <SelectContent>
              {services.map(service => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name} ({service.durationMinutes} minutes)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="appointment-start">Start time in your local timezone</Label>
          <Input id="appointment-start" type="datetime-local" required value={localTime}
            onChange={event => {
              setLocalTime(event.target.value); setSelection(null); setSnapshot(null); setConnected(false);
            }} />
        </div>
        <Button type="submit" disabled={!serviceTypeId || !localTime}>Check availability</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite" className="space-y-2">
        <p>{connected ? 'Live updates connected' : 'Live updates disconnected'}</p>
        {snapshot && (
          <>
            <p>{snapshot.available ? 'Available at last check' : 'Unavailable at last check'}</p>
            <p>{new Date(snapshot.startsAt).toLocaleString()} – {new Date(snapshot.endsAt).toLocaleString()}</p>
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Availability does not reserve a technician or bay. Confirmation always checks again.
      </p>
    </main>
  );
}
~~~

The first HTTP response discovers the correct dealership-local topic. Once the subscription joins, the helper fetches again, closing the snapshot/subscription race. Requests from a previous selection are aborted and cannot overwrite the new selection.

- [ ] **Step 2: Add the isolated route while preserving the existing root preview.**

In apps/web/src/main.tsx add this import and replace the App element only:

~~~tsx
import { AvailabilityMonitor } from './booking/AvailabilityMonitor';

// Inside the existing MotionConfig, replace <App /> with:
{window.location.pathname === '/appointments/availability'
  ? <AvailabilityMonitor />
  : <App />}
~~~

Do not replace App.tsx or SalesHubShowcase.tsx. If main.tsx gained other routes since this plan was written, preserve those routes and add only this exact path.

Replace apps/web/vite.config.ts with the following, preserving any additional unrelated configuration that exists at execution time:

~~~ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
});
~~~

For a hosted frontend, configure its hosting reverse proxy to route /api to NestJS. Vite's development proxy is not a production proxy.

- [ ] **Step 3: Run frontend checks and a browser smoke check.**

~~~sh
pnpm --filter @keyloop-interview/web test
pnpm --filter @keyloop-interview/web typecheck
pnpm --filter @keyloop-interview/web build
~~~

Expected: PASS. Open / and verify the existing preview is preserved. Open /appointments/availability and verify labelled keyboard-accessible controls, error display for an out-of-hours selection, and the exact-time HTTP request. A missing Supabase environment must display an error; it must not silently simulate live updates.

- [ ] **Step 4: Commit the monitor and configuration test.**

~~~sh
git add apps/web/src/booking/AvailabilityMonitor.tsx apps/web/src/main.tsx apps/web/vite.config.ts
git commit -m "feat(web): add isolated realtime appointment availability monitor"
~~~

## Task 5: Verify actual Supabase delivery and document the boundary

**Files:** Modify apps/api/README.md and root README.md; no production data cleanup.

- [ ] **Step 1: Configure the explicitly selected Supabase project and apply migrations.**

Use the project's Connect panel to obtain a server database URL, CA certificate,
project URL, and publishable key. Store server values in ignored apps/api/.env
and browser values in ignored apps/web/.env. Confirm that public Broadcast
subscriptions are allowed for this project's guest availability feed and that
scheduler is not an exposed Data API schema.

Do not infer the project from another chat or from the inventory-dashboard spec.

~~~sh
pnpm --filter @keyloop-interview/api build
pnpm --filter @keyloop-interview/api migration:run:supabase
pnpm --filter @keyloop-interview/api db:seed
pnpm dev
~~~

Expected: both migrations are applied to the selected Supabase database; API and web dev servers start. The ordinary PostgreSQL stub must never be installed on this target. Do not print any database URL or key during verification.

- [ ] **Step 2: Verify subscriptions and actual database-originated events with two guest browser contexts.**

Open http://127.0.0.1:5173/appointments/availability in two independent guest tabs or browser contexts. Select Oil change and the same future appointment start, fully inside the actual configured opening hours.

Both pages must show Live updates connected and the HTTP availability result. Inspect WebSocket messages: channel topics must be availability:YYYY-MM-DD and event payloads must contain only date. No customer table subscription or booking-row stream should exist.

- [ ] **Step 3: Confirm a booking through the API and observe the other page refresh.**

Run this in browser context A's developer console, using the service ID and timestamp from its actual availability request:

~~~js
const request = performance.getEntriesByType('resource')
  .filter(entry => entry.name.includes('/api/availability?')).at(-1);
if (!request) throw new Error('Check availability in the page first');
const query = new URL(request.name).searchParams;
const response = await fetch('/api/service-bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Realtime Test Guest',
    email: 'realtime-' + Date.now() + '@example.com',
    phoneNumber: '+84901234567',
    registrationNumber: 'RT-' + Date.now(),
    serviceTypeId: query.get('serviceTypeId'),
    startsAt: query.get('startsAt'),
  }),
});
const confirmation = await response.json();
if (response.status !== 201) throw new Error('Expected a confirmed booking');
console.log({ bookingId: confirmation.id, status: confirmation.status });
~~~

Expected: context B receives availability_changed, issues a new GET /api/availability,
and displays the recomputed result without reloading. If the selected service still
has another qualified resource pair, it may correctly remain available. The seed
catalog gives Oil change only one qualified technician, so the same interval becomes
unavailable with that catalog.

Record the created test booking ID and target project. Do not delete existing
bookings or customers to reset availability. Use a different future interval for
subsequent manual checks.

- [ ] **Step 4: Verify recovery and privacy, then append the exact documentation below.**

Disconnect context B's network, make another booking in context A for B's selected
future interval using a fresh unoccupied time, then restore B's connection.
Expected: on resubscription B refetches authoritative availability even if the event
was missed. Switch away and focus B again; verify a fresh request.

Change date/service selections repeatedly and verify old channels are removed and
old HTTP responses do not replace the current result. Send ten date-only test
broadcasts in a short burst from an independent public client; verify they only
cause coalesced HTTP refetches and cannot make a booking or mark a slot available
without an HTTP response. Verify a failed confirmation does not produce a committed
booking event.

Append to apps/api/README.md:

~~~markdown
## Realtime availability

For Supabase, build and run migration:run:supabase instead of the core-only
migration command. This installs the transactional booking Broadcast trigger.
The initial schema migration is shared and is not applied twice.

The server sets scheduler.timezone inside every booking transaction. The trigger
publishes availability_changed to availability:YYYY-MM-DD with a date-only payload.
The channel is public for guest subscribers; customer/booking tables remain private.

The browser uses VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Never put
database URLs, server keys, or customer data in browser environment values or events.
Use /appointments/availability for the isolated monitor; the existing root preview
is preserved. The Vite /api proxy is development-only.

Realtime events invalidate displayed availability. They do not reserve resources,
prove booking success, or replace PostgreSQL row locks. The browser refetches after
subscribing, reconnecting, focusing, and relevant invalidations.

The local realtime.send stub tests payload shape and rollback only. Actual
WebSocket delivery must be verified against the selected Supabase project with two
browser contexts. Report both evidence boundaries separately.
~~~

Append to root README.md:

~~~markdown
## Realtime availability monitor

The isolated /appointments/availability path uses the NestJS API for authoritative
availability and Supabase Broadcast for date-only invalidation events. Configure
the browser-safe Supabase URL/publishable key in apps/web/.env. See apps/api/README.md
for migrations and verification. The existing root component preview remains.
~~~

- [ ] **Step 5: Run final checks and commit the documentation.**

~~~sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api test:integration
git diff --check
git add apps/api/README.md README.md
git commit -m "docs: document realtime appointment verification"
~~~

Expected: checks PASS. Report the actual unit, PostgreSQL, HTTP, browser, and Supabase
results independently. If hosted credentials or the real schedule are unavailable,
finish local implementation/checks and mark live acceptance pending; do not call
Realtime verified from mocks or a local SQL stub.

## Self-review checklist

- [ ] Events contain only date; server writes are transactional: Tasks 1 and 2.
- [ ] Old/new date invalidation and no events after rollback: Tasks 1 and 2.
- [ ] Public subscription without login and no private row exposure: Tasks 1, 3, 5.
- [ ] Subscription snapshot, reconnect, focus, coalescing, cleanup, in-flight events: Task 3.
- [ ] No direct client booking writes or optimistic local availability changes: Tasks 3 and 4.
- [ ] Existing UI and inventory work preserved: Task 4.
- [ ] Actual two-browser Supabase proof: Task 5, explicitly separate from local tests.
- [ ] Booking correctness continues to use the backend plan's transaction and row locks.

## Primary references

- Supabase database subscriptions: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Broadcast and realtime.send: https://supabase.com/docs/guides/realtime/broadcast
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- PostgreSQL row locks: https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS

This document is a plan, not a claim that its proposed code or tests have run.
