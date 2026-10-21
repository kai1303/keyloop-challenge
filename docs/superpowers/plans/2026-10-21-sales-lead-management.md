# Sales Lead Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sales Leads admin inbox with complete lead details, chronological follow-up history, and durable activity creation.

**Architecture:** React calls three NestJS endpoints; NestJS uses Supabase PostgreSQL through a server-only Supabase client. Reuse the existing admin shell and shared Keyloop controls. Use seeded fictional enquiries, append-only activities, and stable submission IDs to avoid duplicate records after retries.

**Tech Stack:** Existing pnpm/Turborepo, React, Vite, TypeScript, NestJS, Vitest, React Testing Library, Supertest; add `@supabase/supabase-js` to the API only. Local Supabase CLI and Docker provide the database.

---

## Execution context

Approved flow: [design spec](../specs/2026-10-21-sales-lead-management-design.md). The user's move to writing-plans follows the written-spec review request. This document plans implementation; application code has not been changed by this planning task.

All paths below are relative to `/Users/kai/works/side-project/keyloop-interview`.
Run root commands there unless an explicit `--filter` changes the package context.

Important source facts from 2026-10-21:

- Almost all application files are **untracked pre-existing user work**. Only design specs are tracked. Preserve them, and never `git add .`, reset, clean, stash, or commit unrelated files.
- CodeGraph currently indexes only two YAML files. Its context call returns no application symbols; direct source reads are necessary until that index covers the code.
- The booking page changed during planning: it now uses the shared Sidebar components and Tabs, and opens booking details in a popover. Preserve those current interactions. Do not restore an older fixed booking details panel.
- `main.tsx` currently dispatches `/admin/bookings` and `/`. Merge the leads branch into the latest route dispatch without replacing concurrent inventory work.
- No actual Supabase integration or AdminLayout was present in inspected files. Reuse either if compatible code appears before execution.
- Node is v25.2.1, pnpm 8.10.3, and Supabase CLI 2.117.0 is installed. Do not assume CLI behavior introduced in later versions, and do not upgrade the user's tools for this task.
- A separate worktree would omit the untracked application. Execute scoped edits in the shared checkout unless a complete isolated checkout has been arranged. Never copy ignored credentials to make a worktree work.
- Preserve the starter API endpoint and the component showcase. No website ingestion, public hosting, authentication, realtime feed, analytics, filtering, or activity editing/deletion.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/config.toml` | Local project identity and free development ports; reuse if present |
| `supabase/migrations/20261021000300_sales_leads.sql` | Two tables, constraints, indexes, row-level security and server-only privileges |
| `supabase/seeds/sales-leads.sql` | Repeatable non-overwriting fictional enquiries and history |
| `apps/api/src/leads/leads.service.ts` | Supabase reads and append/retry behavior |
| `apps/api/src/leads/leads.controller.ts` | Request validation and HTTP status contract |
| `apps/api/src/leads/leads.module.ts` | Server-only database provider and feature registration |
| `apps/api/src/leads/leads.controller.spec.ts` | HTTP validation/status tests without a database |
| `apps/api/test/leads.db-test.ts` | Real database integration tests using isolated fixture IDs |
| `apps/api/vitest.config.leads-db.ts` | Explicit opt-in real-database test suite |
| `apps/api/src/app.module.ts`, `src/main.ts` | Register leads and bind the demo API to loopback |
| `apps/api/test/app.e2e-spec.ts` | Preserve starter test with a database provider override |
| `apps/api/package.json`, root lockfile | Supabase dependency and database test script |
| `apps/api/.env.example` | Server configuration names without credentials |
| `apps/web/src/admin/AdminLayout.tsx`, `admin-layout.css` | Shared existing shell and truthful per-feature demo copy |
| `apps/web/src/admin/BookingDashboard.tsx`, `booking-dashboard.css` | Adopt shared shell without changing booking state or dialogs |
| `apps/web/src/admin/leads/leads-api.ts` | HTTP types, API requests and timestamp formatting |
| `apps/web/src/admin/leads/LeadInbox.tsx` | Accessible inbox table |
| `apps/web/src/admin/leads/LeadDetails.tsx` | Contact details, original enquiry and activity history |
| `apps/web/src/admin/leads/ActivityDialog.tsx` | Draft, validation, save/retry and focus lifecycle |
| `apps/web/src/admin/leads/LeadsDashboard.tsx`, `leads.css` | Read lifecycle, selection, success state and responsive composition |
| `apps/web/src/admin/leads/LeadsDashboard.test.tsx` | User flow and failed/out-of-order requests |
| `apps/web/src/admin/leads/ActivityDialog.test.tsx` | Retry identity, pending dismissal and duplicate submission |
| `apps/web/src/main.tsx`, `vite.config.ts` | Lazy route and local `/api` proxy |
| `apps/web/README.md`, `apps/api/README.md`, `README.md` | Route, explicit setup/seeding, verification and demo boundary |

## Task 1: Local database and repeatable fixtures

**Files:** Create or merge `supabase/config.toml`; create the migration and seed files in the map above. No reset commands.

- [ ] **Step 1: Inspect existing local services before starting anything.**

```sh
git status --short
docker ps --format '{{.Names}} {{.Ports}}'
lsof -nP -iTCP:54321 -iTCP:54322 -iTCP:54323 -sTCP:LISTEN
supabase status
```

Expected: identify ownership of any running stack. A missing project/status is normal before initialization. Reuse the compatible project created by inventory if present. If occupied by another project, choose free API/database/Studio ports and record them in configuration and local env; do not stop that project. Default ports below apply only after this check.

- [ ] **Step 2: Create configuration only if absent, and restrict host bindings.**

```sh
supabase init
docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 keyloop-interview-local
```

Run `supabase init` only if `supabase/config.toml` does not exist; never `--force`. If the named network already exists, inspect its binding option instead of recreating it. Keep generated CLI defaults; set `project_id = "keyloop-interview"`, use the verified free ports, and keep automatic seed loading disabled (`[db.seed] enabled = false`). Add these exact settings to their existing TOML sections, not duplicate sections:

```toml
project_id = "keyloop-interview"

[api]
port = 54321

[db]
port = 54322

[db.seed]
enabled = false

[studio]
port = 54323
```

These are edits to generated configuration, not a replacement of the generated file. If a compatible existing stack has different ports, retain its actual values. After startup, inspect Docker port mappings and require loopback for every published endpoint. If the installed CLI explicitly publishes wildcard addresses despite the network default, stop only the newly created feature stack with ordinary `supabase stop` (no data-discard flags), fix binding before loading data, and report the concrete limitation if it cannot be resolved.

- [ ] **Step 3: Create the failing database contract check before the migration.**

Start the identified project using `supabase start --network-id keyloop-interview-local`. Obtain its container ID through `docker ps`; confirm the exact project label/name before using it. Run SQL through that container's `psql`:

```sh
docker exec -i supabase_db_keyloop-interview psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'select id, customer_name from public.sales_leads limit 1'
```

Expected before the migration: relation `sales_leads` does not exist. Adapt the **verified** container name if using an existing compatible project. Do not assume the generated name when executing.

- [ ] **Step 4: Write `supabase/migrations/20261021000300_sales_leads.sql`.**

Check that this migration timestamp is unused; choose the next unused timestamp if concurrent work has taken it.

```sql
create table public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(btrim(customer_name)) > 0),
  email text not null,
  phone text not null,
  vehicle_interest text not null,
  enquiry text not null,
  source text not null default 'Dealership website',
  received_at timestamptz not null default now()
);

create table public.sales_lead_activities (
  id uuid primary key,
  lead_id uuid not null references public.sales_leads(id),
  note text not null check (
    note = btrim(note)
    and char_length(btrim(note, E' \t\n\r\f' || chr(11))) between 1 and 2000
  ),
  created_at timestamptz(3) not null default clock_timestamp()
);

create index sales_leads_received_idx
  on public.sales_leads (received_at desc, id);
create index sales_lead_activities_history_idx
  on public.sales_lead_activities (lead_id, created_at, id);

alter table public.sales_leads enable row level security;
alter table public.sales_lead_activities enable row level security;
revoke all on public.sales_leads from anon, authenticated;
revoke all on public.sales_lead_activities from anon, authenticated;
grant select, insert, update, delete on public.sales_leads to service_role;
grant select, insert, update, delete on public.sales_lead_activities to service_role;
```

No anonymous policies. Supabase's server service-role credential bypasses RLS; never send it to React. The database service role supports explicit isolated test cleanup; the application exposes no edit/delete routes. Activity timestamps have millisecond precision so PostgreSQL and JavaScript use the same timestamp resolution; ID is the explicit tie-breaker.

- [ ] **Step 5: Write `supabase/seeds/sales-leads.sql` and apply it explicitly.**

```sql
insert into public.sales_leads
  (id, customer_name, email, phone, vehicle_interest, enquiry, source, received_at)
values
  ('10000000-0000-4000-8000-000000000001', 'Alex Morgan',
   'alex@example.com', '+84 900 000 001', 'Toyota Corolla Hybrid',
   E'Can I test-drive the Corolla on Saturday?\nI would also like to discuss a part exchange.',
   'Dealership website', now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000002', 'Jamie Taylor',
   'jamie@example.com', '+84 900 000 002', 'Kia Sportage',
   'Please send details about the automatic Sportage and its service history.',
   'Dealership website', now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000003', 'Sam Williams',
   'sam@example.com', '+84 900 000 003', 'Volkswagen Golf',
   'I am comparing the Golf with the Corolla. Please call after 16:00 to discuss finance and arrange a viewing next week. I need space for a child seat and would like to check the boot capacity during the visit.',
   'Dealership website', now() - interval '3 days')
on conflict (id) do nothing;

insert into public.sales_lead_activities (id, lead_id, note, created_at)
values
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002',
   'Called customer. Left a voicemail.', now() - interval '20 hours'),
  ('20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002',
   'Customer called back. Sent the service history.', now() - interval '18 hours')
on conflict (id) do nothing;
```

```sh
supabase migration up --local
docker exec -i supabase_db_keyloop-interview psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/sales-leads.sql
docker exec -i supabase_db_keyloop-interview psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/sales-leads.sql
```

Expected: three seeded leads and two seeded activities after either seed execution. Inspect only IDs/counts, not credentials. Preserve all other rows. Normal API startup must never run this seed.

- [ ] **Step 6: Commit only newly created lead database files and reviewed configuration changes.**

```sh
git add -- supabase/migrations/20261021000300_sales_leads.sql supabase/seeds/sales-leads.sql
git commit -m "feat: persist sales leads and activity history"
```

Include `supabase/config.toml` only after confirming it contains no credentials and belongs to this work. If existing untracked configuration includes someone else's work, leave it unstaged and report the delivery dependency.

## Task 2: NestJS HTTP contract, validation and persistence

**Files:** Create the three API feature files, controller tests and database test config. Modify AppModule/bootstrap, API package/env example and starter HTTP test. Use `.js` specifiers for local TypeScript imports in the NodeNext API.

- [ ] **Step 1: Write `apps/api/src/leads/leads.controller.spec.ts` before production code.**

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

describe('leads HTTP contract', () => {
  let app: INestApplication;
  const lead = '10000000-0000-4000-8000-000000000001';
  const activity = '20000000-0000-4000-8000-000000000003';
  const service = { list: vi.fn(), detail: vi.fn(), add: vi.fn() };
  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [{ provide: LeadsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it.each([
    null, [], {}, { id: activity, note: '  \n ' },
    { id: activity, note: 'x'.repeat(2001) },
    { id: 'wrong', note: 'Called' }, { id: activity, note: 42 },
    { id: activity, note: 'Called', created_at: '2030-01-01' },
  ])('rejects invalid payload %j', async (body) => {
    const query = request(app.getHttpServer()).post(`/leads/${lead}/activities`);
    if (body === null) await query.set('Content-Type', 'application/json').send('null').expect(400);
    else await query.send(body).expect(400);
    expect(service.add).not.toHaveBeenCalled();
  });
  it('rejects malformed path IDs', async () => {
    await request(app.getHttpServer()).get('/leads/wrong').expect(400);
  });
  it('trims a note and returns the saved record', async () => {
    service.add.mockResolvedValue({ created: true, activity: { id: activity, note: 'Called customer' } });
    const response = await request(app.getHttpServer()).post(`/leads/${lead}/activities`)
      .send({ id: activity, note: ' Called customer ' }).expect(201);
    expect(service.add).toHaveBeenCalledWith(lead, { id: activity, note: 'Called customer' });
    expect(response.body.id).toBe(activity);
  });
  it('returns 200 for an identical retry', async () => {
    service.add.mockResolvedValue({ created: false, activity: { id: activity, note: 'Called' } });
    await request(app.getHttpServer()).post(`/leads/${lead}/activities`)
      .send({ id: activity, note: 'Called' }).expect(200);
  });
  it('returns 404 for a missing lead', async () => {
    service.detail.mockRejectedValue(new NotFoundException('Lead not found.'));
    await request(app.getHttpServer()).get(`/leads/${lead}`).expect(404);
  });
  it('returns a safe unavailable response', async () => {
    service.list.mockRejectedValue(new ServiceUnavailableException('Lead storage is unavailable. Try again.'));
    const response = await request(app.getHttpServer()).get('/leads').expect(503);
    expect(response.body.message).toBe('Lead storage is unavailable. Try again.');
  });
});
```

Run `pnpm --filter @keyloop-interview/api test src/leads/leads.controller.spec.ts`.
Expected first: import failure for missing controller/service, then failing behavior until implemented.

- [ ] **Step 2: Add the single runtime dependency and write the feature module.**

```sh
pnpm --filter @keyloop-interview/api add @supabase/supabase-js@2
```

`apps/api/src/leads/leads.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { LeadsController } from './leads.controller.js';
import { LEADS_DB, LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController],
  providers: [
    { provide: LEADS_DB, useFactory: () => {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the local leads demo.');
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
        throw new Error('The leads demo requires a loopback Supabase URL.');
      }
      return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } },
    LeadsService,
  ],
})
export class LeadsModule {}
```

`apps/api/src/leads/leads.service.ts`:

```ts
import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export const LEADS_DB = Symbol('LEADS_DB');
const unavailable = () => new ServiceUnavailableException('Lead storage is unavailable. Try again.');

@Injectable()
export class LeadsService {
  constructor(@Inject(LEADS_DB) private readonly db: SupabaseClient) {}

  private async query<T>(operation: PromiseLike<T>): Promise<T> {
    try { return await operation; } catch { throw unavailable(); }
  }

  async list() {
    const { data, error } = await this.query(this.db.from('sales_leads')
      .select('id,customer_name,vehicle_interest,enquiry,source,received_at')
      .order('received_at', { ascending: false }).order('id'));
    if (error) throw unavailable();
    return data;
  }

  async detail(id: string) {
    const { data, error } = await this.query(this.db.from('sales_leads')
      .select('*,activities:sales_lead_activities(*)').eq('id', id).maybeSingle());
    if (error) throw unavailable();
    if (!data) throw new NotFoundException('Lead not found.');
    const activities = data.activities as { id: string; created_at: string }[];
    activities.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
    return data;
  }

  async add(leadId: string, body: { id: string; note: string }) {
    const { data, error } = await this.query(this.db.from('sales_lead_activities')
      .insert({ id: body.id, lead_id: leadId, note: body.note }).select('*').single());
    if (!error) return { created: true, activity: data };
    if (error.code === '23503') throw new NotFoundException('Lead not found.');
    if (error.code !== '23505') throw unavailable();
    const existing = await this.query(this.db.from('sales_lead_activities')
      .select('*').eq('id', body.id).maybeSingle());
    if (existing.error || !existing.data) throw unavailable();
    if (existing.data.lead_id !== leadId || existing.data.note !== body.note) {
      throw new ConflictException('This activity reference was already used.');
    }
    return { created: false, activity: existing.data };
  }
}
```

`apps/api/src/leads/leads.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LeadsService } from './leads.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('leads')
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Get()
  list() { return this.leads.list(); }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) { return this.leads.detail(id); }

  @Post(':id/activities')
  async add(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Enter an activity reference and note.');
    }
    const body = raw as Record<string, unknown>;
    if (Object.keys(body).some(key => !['id', 'note'].includes(key)) ||
        typeof body.id !== 'string' || !uuid.test(body.id) ||
        typeof body.note !== 'string' || !body.note.trim() || body.note.trim().length > 2000) {
      throw new BadRequestException('Enter a valid activity reference and a note of 1–2,000 characters.');
    }
    const result = await this.leads.add(id, { id: body.id, note: body.note.trim() });
    response.status(result.created ? 201 : 200);
    return result.activity;
  }
}
```

- [ ] **Step 3: Register the feature and preserve API startup/tests.**

In `apps/api/src/app.module.ts`, add the import and merge the module into the existing imports:

```ts
import { LeadsModule } from './leads/leads.module.js';
// Within the existing @Module object:
imports: [LeadsModule],
```

If imports already contains inventory or appointment modules, retain them.
In `apps/api/src/main.ts`, keep Nest bootstrap but bind the current demo listener:

```ts
await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
```

Do not add browser CORS as a substitute for authorization; the Vite proxy makes requests same-origin. In `apps/api/test/app.e2e-spec.ts`, import `LEADS_DB` and insert the override before `.compile()` so the existing root-endpoint test does not require secrets:

```ts
import { LEADS_DB } from '../src/leads/leads.service.js';

const moduleFixture: TestingModule = await Test.createTestingModule({
  imports: [AppModule],
}).overrideProvider(LEADS_DB).useValue({}).compile();
```

`apps/api/.env.example` contains only:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=
PORT=3000
```

Do not silently add dotenv. Node can load a local env file via `node --env-file=.env` in the explicit run command documented in Task 7.

- [ ] **Step 4: Verify red-to-green and commit the API change scope.**

```sh
pnpm --filter @keyloop-interview/api test src/leads/leads.controller.spec.ts
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api typecheck
```

Expected: contract tests and starter endpoint pass without real credentials. Invalid bodies never call persistence. Scope commits to `apps/api/src/leads/` and the feature env example. Because existing app/package files are currently untracked, do not stage their full contents without a prior owned baseline; report those files as preserved working-tree dependencies. Review the lockfile diff before including its dependency change.

## Task 3: Real database behavior and restart proof

**Files:** Create `apps/api/test/leads.db-test.ts`, `apps/api/vitest.config.leads-db.ts`; add `test:leads-db` to API scripts.

- [ ] **Step 1: Create a dedicated disposable local test project before real database tests.**

Repeat Task 1's local-only setup in a temporary directory with project ID
`keyloop-leads-tests` and separate verified free ports (suggested 55321, 55322,
55323). Copy only the reviewed migration there, never existing environment files.
Use the same loopback network. Do not reset the normal demo database. Record the
test project's actual container and ports. Put its URL/key in ignored
`apps/api/.env.leads-test`; the test must require an explicit marker.

```dotenv
LEADS_TEST_PROJECT=keyloop-leads-tests
LEADS_TEST_SUPABASE_URL=http://127.0.0.1:55321
LEADS_TEST_SERVICE_ROLE_KEY=
LEADS_TEST_ANON_KEY=
```

The key values are obtained privately from that exact local project's status;
do not print them in tool output or commit them. If the stack cannot start,
record the blocker and keep the database suite failing clearly rather than
skipping it or claiming persistence proof from a mock.

- [ ] **Step 2: Write the database suite and verify it fails before migrations.**

`apps/api/vitest.config.leads-db.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/leads.db-test.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
```

Add this API package script while preserving all other scripts:

```json
"test:leads-db": "node --env-file=.env.leads-test ./node_modules/vitest/vitest.mjs run --config ./vitest.config.leads-db.ts"
```

`apps/api/test/leads.db-test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LeadsModule } from '../src/leads/leads.module.js';
import { LEADS_DB } from '../src/leads/leads.service.js';

const url = process.env.LEADS_TEST_SUPABASE_URL;
const key = process.env.LEADS_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.LEADS_TEST_ANON_KEY;
if (process.env.LEADS_TEST_PROJECT !== 'keyloop-leads-tests' || !url || !key || !anonKey ||
    !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('Provide the dedicated loopback keyloop-leads-tests configuration.');
}
const db = createClient(url, key, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const leadA = randomUUID();
const leadB = randomUUID();
let app: INestApplication;
async function startApp() {
  const module = await Test.createTestingModule({ imports: [LeadsModule] })
    .overrideProvider(LEADS_DB).useValue(db).compile();
  const instance = module.createNestApplication();
  await instance.init();
  return instance;
}
beforeAll(async () => {
  const { error } = await db.from('sales_leads').insert([leadA, leadB].map((id, index) => ({
    id, customer_name: `Isolated test ${index}`, email: 'test@example.com', phone: '000',
    vehicle_interest: 'Corolla', enquiry: 'Test enquiry', source: 'Automated test',
    received_at: index === 0 ? '2030-01-02T00:00:00Z' : '2030-01-01T00:00:00Z',
  })));
  if (error) throw new Error('Test fixture insertion failed; check migrations.');
  app = await startApp();
});
afterAll(async () => {
  await app?.close();
  const activities = await db.from('sales_lead_activities').delete().in('lead_id', [leadA, leadB]);
  const leads = await db.from('sales_leads').delete().in('id', [leadA, leadB]);
  if (activities.error || leads.error) throw new Error('Isolated fixture cleanup failed.');
});
it('sorts inbox leads newest first', async () => {
  const response = await request(app.getHttpServer()).get('/leads').expect(200);
  const ids = response.body.map((lead: { id: string }) => lead.id);
  expect(ids.indexOf(leadA)).toBeLessThan(ids.indexOf(leadB));
});
it('preserves concurrent appends, isolates leads, and deduplicates concurrent retries', async () => {
  const first = { id: randomUUID(), note: 'First call' };
  const second = { id: randomUUID(), note: 'Second call' };
  const path = `/leads/${leadA}/activities`;
  const writes = await Promise.all([
    request(app.getHttpServer()).post(path).send(first),
    request(app.getHttpServer()).post(path).send(first),
    request(app.getHttpServer()).post(path).send(second),
  ]);
  expect(writes.map(value => value.status).sort()).toEqual([200, 201, 201]);
  const history = await request(app.getHttpServer()).get(`/leads/${leadA}`).expect(200);
  expect(history.body.activities).toHaveLength(2);
  expect(new Set(history.body.activities.map((entry: { id: string }) => entry.id)).size).toBe(2);
  const times = history.body.activities.map((entry: { created_at: string }) => Date.parse(entry.created_at));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  const other = await request(app.getHttpServer()).get(`/leads/${leadB}`).expect(200);
  expect(other.body.activities).toEqual([]);
  await request(app.getHttpServer()).post(path).send({ ...first, note: 'Changed' }).expect(409);
  await request(app.getHttpServer()).post(`/leads/${leadB}/activities`).send(first).expect(409);
  await app.close();
  app = await startApp();
  const reopened = await request(app.getHttpServer()).get(`/leads/${leadA}`).expect(200);
  expect(reopened.body.activities).toHaveLength(2);
});
it('rejects missing leads and database-invalid notes', async () => {
  await request(app.getHttpServer()).get(`/leads/${randomUUID()}`).expect(404);
  await request(app.getHttpServer()).post(`/leads/${randomUUID()}/activities`)
    .send({ id: randomUUID(), note: 'Called' }).expect(404);
  for (const note of ['', '  ', '\n\t', 'x'.repeat(2001)]) {
    const result = await db.from('sales_lead_activities').insert({ id: randomUUID(), lead_id: leadB, note });
    expect(result.error?.code).toBe('23514');
  }
});
it('uses activity ID to order equal timestamps deterministically', async () => {
  const ids = ['30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001'];
  const { error } = await db.from('sales_lead_activities').insert(ids.map(id => ({
    id, lead_id: leadB, note: 'Equal timestamp fixture', created_at: '2030-01-01T00:00:00Z',
  })));
  expect(error).toBeNull();
  const response = await request(app.getHttpServer()).get(`/leads/${leadB}`).expect(200);
  expect(response.body.activities.map((entry: { id: string }) => entry.id)).toEqual([...ids].sort());
});
it('does not expose lead reads or writes to the anonymous database client', async () => {
  expect((await anon.from('sales_leads').select('*')).error).toBeTruthy();
  expect((await anon.from('sales_lead_activities').insert({ id: randomUUID(), lead_id: leadA, note: 'Blocked' })).error).toBeTruthy();
});
```

The app restart in this test proves state is outside the Nest process; it does
not replace Task 7's actual database restart proof. The equal-time case runs
after the empty-B assertion and uses fixture IDs removed by the same cleanup.

- [ ] **Step 3: Apply the migration to the identified test project and run green.**

Run from `apps/api`:

```sh
pnpm test:leads-db
```

Equivalent direct command, using the API package's direct dependency symlink:

```sh
node --env-file=.env.leads-test ./node_modules/vitest/vitest.mjs run --config vitest.config.leads-db.ts
```

Expected before migration: fixture insertion fails. After the migration: actual
HTTP writes/reads, concurrent retries, constraints and anonymous denial pass.
Keep env-file loading paths relative to `apps/api`. Ordinary `pnpm test` must
not discover `*.db-test.ts` and must require no database credentials.

- [ ] **Step 4: Commit the dedicated database test files only.**

```sh
git add -- apps/api/test/leads.db-test.ts apps/api/vitest.config.leads-db.ts
git commit -m "test: verify lead persistence and concurrent activity retries"
```

## Task 4: Share the existing admin shell without changing bookings

**Files:** Create `apps/web/src/admin/AdminLayout.tsx` and `admin-layout.css` if no compatible shared layout exists. Modify the current `BookingDashboard.tsx` and `booking-dashboard.css` narrowly. Do not edit shared Sidebar primitives.

- [ ] **Step 1: Add a shell regression assertion to the current booking test.**

Inside the existing booking test suite, using its existing `setup` helper:

```tsx
it("keeps booking tools and links to Sales Leads", () => {
  setup()
  const navigation = within(screen.getByRole("navigation", { name: "Admin navigation" }))
  expect(navigation.getByRole("link", { name: "Bookings" }).getAttribute("aria-current")).toBe("page")
  expect(navigation.getByRole("link", { name: "Sales Leads" }).getAttribute("href")).toBe("/admin/leads")
  expect(navigation.getByRole("link", { name: "Sales Leads" }).hasAttribute("aria-current")).toBe(false)
  expect(navigation.getByRole("button", { name: "Resources" })).toBeTruthy()
  expect(navigation.getByRole("button", { name: "Opening hours" })).toBeTruthy()
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/BookingDashboard.test.tsx`.
Expected new failure: Sales Leads link missing. Keep existing popover interaction tests unchanged.

- [ ] **Step 2: Extract the shell using current shared Sidebar controls.**

`apps/web/src/admin/AdminLayout.tsx`:

```tsx
import type { ReactNode } from "react"
import { Badge } from "@keyloop-interview/ui/components/badge"
import {
  Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@keyloop-interview/ui/components/sidebar"
import "./admin-layout.css"

type Props = {
  activePage: "bookings" | "leads"
  children: ReactNode
  actions?: { label: string; onClick: () => void }[]
}

export function AdminLayout({ activePage, children, actions = [] }: Props) {
  const leads = activePage === "leads"
  return (
    <SidebarProvider className="admin-app">
      <Sidebar collapsible="none" className="admin-sidebar" role="complementary" aria-label="Dealership administration">
        <SidebarHeader className="p-0">
          <a className="admin-brand" href="/admin/bookings">keyloop<span aria-hidden="true">.</span></a>
          <p className="admin-product">{leads ? "SALES OPERATIONS" : "SERVICE OPERATIONS"}</p>
          <div className="admin-domain"><span>{leads ? "DEMAND" : "OPERATE"}</span><span className="admin-domain-line" /></div>
        </SidebarHeader>
        <SidebarContent className="admin-sidebar-content">
          <nav aria-label="Admin navigation">
            <SidebarMenu className="admin-nav">
              {[
                { id: "bookings", label: "Bookings", href: "/admin/bookings" },
                { id: "leads", label: "Sales Leads", href: "/admin/leads" },
              ].map(page => (
                <SidebarMenuItem key={page.id}>
                  <SidebarMenuButton asChild isActive={activePage === page.id}>
                    <a href={page.href} aria-current={activePage === page.id ? "page" : undefined}>{page.label}</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {actions.map(action => (
                <SidebarMenuItem key={action.label}>
                  <SidebarMenuButton onClick={action.onClick}>{action.label}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="admin-sidebar-footer px-0 pb-0">
          <Badge variant="outline">Demo workspace</Badge>
          <p>{leads ? "Fictional enquiries. Activities are saved to the local database." : "Fictional bookings. Changes reset on refresh."}</p>
          <a href="/">Component library ↗</a>
        </SidebarFooter>
      </Sidebar>
      <main className="admin-main">{children}</main>
    </SidebarProvider>
  )
}
```

If an inventory route/layout already exists, preserve its navigation and broaden
the existing active-page type rather than replacing the shell with this two-page
example. Resource/hour handlers remain owned by BookingDashboard.

In `BookingDashboard.tsx`, remove only the Sidebar imports and sidebar JSX.
Replace its opening `SidebarProvider` with this opening component, and remove
the existing outer `<main className="admin-main">` / `</main>` tags because the
layout supplies them. Replace the closing `</SidebarProvider>` with
`</AdminLayout>`. Keep all existing page content and modal JSX in place:

```tsx
import { AdminLayout } from "./AdminLayout"

<AdminLayout activePage="bookings" actions={[
  { label: "Resources", onClick: () => openModal("resources") },
  { label: "Opening hours", onClick: () => openModal("hours") },
]}>
```

These are targeted tag edits to the existing return body. Keep popover details inside BookingSchedule, current
Tabs, selection defaults, portal focus handling, save/cancel handlers and booking
footer copy exactly as implemented at execution time.

- [ ] **Step 3: Move common CSS and restrict active-link styling.**

Move the existing declarations for `.admin-app`, `.admin-sidebar`, `.admin-brand`,
`.admin-brand span`, `.admin-product`, `.admin-domain`, `.admin-domain-line`,
`.admin-nav`, its link/button rules, `.admin-sidebar-footer` and descendants,
`.admin-main`, `.admin-header` and descendants, `.admin-eyebrow`, and
`.admin-page-footer` from booking-dashboard.css to admin-layout.css. Move only
their responsive rules with them; keep booking timeline, metrics, filters,
status and booking detail rules in booking-dashboard.css. This is a literal
move, preserving the existing declarations, plus the following exact changes:

```css
/* In admin-layout.css: baseline link rule keeps padding, font and radius. */
.admin-nav a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px var(--kl-space-3);
  border-radius: var(--kl-radius-control);
  border-left: 3px solid transparent;
  font-weight: 500;
  font-size: 14px;
}
.admin-nav a[aria-current="page"] {
  background: color-mix(in srgb, var(--kl-color-white) 12%, transparent);
  border-left-color: var(--kl-color-cta);
}
.admin-app > .admin-sidebar {
  width: 100%;
  min-width: 0;
}
.admin-sidebar-content { overflow: visible; }
@media (max-width: 520px) {
  .admin-nav { flex-wrap: wrap; }
}
```

Moving code does not justify changing booking styles. Inspect the result at
320px, 390px and desktop. Shared Sidebar width utilities must not create document
overflow. Do not duplicate the complete booking stylesheet in the leads feature.

- [ ] **Step 4: Run current booking tests and inspect the scoped extraction.**

```sh
pnpm --filter @keyloop-interview/web test src/admin/BookingDashboard.test.tsx
pnpm --filter @keyloop-interview/web typecheck
```

Expected: existing calendar/list/popover/modal tests plus the new nav assertion
pass. Commit newly owned AdminLayout/CSS files; preserve untracked booking files
and clearly report their changes rather than silently claiming their entire
contents as newly authored code.

## Task 5: HTTP client and activity form with safe retries

**Files:** Create `apps/web/src/admin/leads/leads-api.ts`, `ActivityDialog.tsx` and `ActivityDialog.test.tsx`. Use shared controls; no new frontend dependencies.

- [ ] **Step 1: Write the HTTP client and activity interaction tests first.**

`apps/web/src/admin/leads/ActivityDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LazyMotion, domAnimation, MotionConfig } from "motion/react"
import { ActivityDialog } from "./ActivityDialog"
import { addActivity, type Activity, type LeadDetails } from "./leads-api"

vi.mock("./leads-api", async importOriginal => ({
  ...await importOriginal<typeof import("./leads-api")>(), addActivity: vi.fn(),
}))
const lead: LeadDetails = {
  id: "10000000-0000-4000-8000-000000000001", customer_name: "Alex Morgan",
  email: "alex@example.com", phone: "0001", vehicle_interest: "Toyota Corolla",
  enquiry: "Saturday test drive", source: "Dealership website", received_at: "2030-01-01T00:00:00Z", activities: [],
}
const saved: Activity = { id: "20000000-0000-4000-8000-000000000001", lead_id: lead.id, note: "Called customer", created_at: "2030-01-02T00:00:00Z" }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup() {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(<LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="always">
    <ActivityDialog lead={lead} onSaved={onSaved} onClose={onClose} />
  </MotionConfig></LazyMotion>)
  return { user: userEvent.setup(), onSaved, onClose }
}
it("rejects a whitespace-only note before sending", async () => {
  const { user } = setup()
  await user.type(screen.getByLabelText("Activity note"), "   ")
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  expect(screen.getByRole("alert").textContent).toMatch(/1–2,000/)
  expect(addActivity).not.toHaveBeenCalled()
})
it("retains the note and submission ID after a failed request", async () => {
  vi.mocked(addActivity).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(saved)
  const { user, onSaved } = setup()
  await user.type(screen.getByLabelText("Activity note"), " Called customer ")
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Offline")
  expect((screen.getByLabelText("Activity note") as HTMLTextAreaElement).value).toBe(" Called customer ")
  const firstPayload = vi.mocked(addActivity).mock.calls[0][1]
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
  expect(vi.mocked(addActivity).mock.calls[1][1]).toEqual(firstPayload)
  expect(firstPayload.note).toBe("Called customer")
})
it("uses a new ID when a failed draft is changed", async () => {
  vi.mocked(addActivity).mockRejectedValue(new Error("Offline"))
  const { user } = setup()
  await user.type(screen.getByLabelText("Activity note"), "First note")
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  await screen.findByRole("alert")
  const firstId = vi.mocked(addActivity).mock.calls[0][1].id
  await user.clear(screen.getByLabelText("Activity note"))
  await user.type(screen.getByLabelText("Activity note"), "Changed note")
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  await waitFor(() => expect(addActivity).toHaveBeenCalledTimes(2))
  expect(vi.mocked(addActivity).mock.calls[1][1].id).not.toBe(firstId)
})
it("prevents duplicate submissions and dismissal while saving", async () => {
  let resolve!: (activity: Activity) => void
  vi.mocked(addActivity).mockImplementation(() => new Promise(done => { resolve = done }))
  const { user, onClose, onSaved } = setup()
  await user.type(screen.getByLabelText("Activity note"), "Called customer")
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  await user.click(screen.getByRole("button", { name: "Saving…" }))
  await user.keyboard("{Escape}")
  expect(addActivity).toHaveBeenCalledTimes(1)
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole("dialog")).toBeTruthy()
  resolve(saved)
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
  expect(onClose).toHaveBeenCalledTimes(1)
})
it("allows cancellation before saving", async () => {
  const { user, onClose } = setup()
  await user.type(screen.getByLabelText("Activity note"), "Discard this")
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(addActivity).not.toHaveBeenCalled()
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/leads/ActivityDialog.test.tsx`.
Expected first: missing dialog module, then behavioral failures until implemented.

- [ ] **Step 2: Write the frontend HTTP boundary and timestamp formatter.**

`apps/web/src/admin/leads/leads-api.ts`:

```ts
export type LeadSummary = {
  id: string
  customer_name: string
  vehicle_interest: string
  enquiry: string
  source: string
  received_at: string
}
export type Activity = { id: string; lead_id: string; note: string; created_at: string }
export type LeadDetails = LeadSummary & { email: string; phone: string; activities: Activity[] }

async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/leads${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.message === "string" ? body.message : "Unable to load or save lead data. Try again.")
  }
  return response.json() as Promise<T>
}
export const listLeads = (signal?: AbortSignal) => read<LeadSummary[]>("", { signal })
export const getLead = (id: string, signal?: AbortSignal) => read<LeadDetails>(`/${encodeURIComponent(id)}`, { signal })
export const addActivity = (leadId: string, body: { id: string; note: string }) =>
  read<Activity>(`/${encodeURIComponent(leadId)}/activities`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short",
})
export const formatLeadTime = (value: string) => formatter.format(new Date(value))
```

Keep response data in the database's field names; no redundant mapping layer.
No Supabase keys or direct database client belong in this module.

- [ ] **Step 3: Write the single-purpose dialog.**

`apps/web/src/admin/leads/ActivityDialog.tsx`:

```tsx
import { useRef, useState, type FormEvent } from "react"
import { Button } from "@keyloop-interview/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@keyloop-interview/ui/components/dialog"
import { Label } from "@keyloop-interview/ui/components/label"
import { Textarea } from "@keyloop-interview/ui/components/textarea"
import { addActivity, type Activity, type LeadDetails } from "./leads-api"

export function ActivityDialog({ lead, onSaved, onClose }: {
  lead: LeadDetails; onSaved: (activity: Activity) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const attempt = useRef<{ id: string; note: string } | null>(null)
  const trigger = useRef(document.activeElement as HTMLElement | null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    const note = draft.trim()
    if (!note || note.length > 2000) { setError("Enter an activity note of 1–2,000 characters."); return }
    if (attempt.current?.note !== note) attempt.current = { id: crypto.randomUUID(), note }
    pending.current = true; setSaving(true); setError("")
    let activity: Activity
    try {
      activity = await addActivity(lead.id, attempt.current)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save. Try again.")
      return
    } finally {
      pending.current = false; setSaving(false)
    }
    onSaved(activity)
    onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose() }}>
    <DialogContent showCloseButton={!saving}
      onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }}
      onInteractOutside={event => { if (pending.current) event.preventDefault() }}
      onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus() }}>
      <DialogHeader><DialogTitle>Log activity</DialogTitle><DialogDescription>Record a follow-up for {lead.customer_name}. This note will be saved to their history.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-5" aria-busy={saving}>
        <div className="grid gap-2"><Label htmlFor="lead-activity-note">Activity note</Label>
          <Textarea id="lead-activity-note" value={draft} onChange={event => setDraft(event.target.value)} required maxLength={2000} rows={5} disabled={saving}
            aria-invalid={Boolean(error)} aria-describedby={error ? "lead-activity-help lead-activity-error" : "lead-activity-help"} />
          <p id="lead-activity-help" className="text-xs text-muted-foreground">Describe what happened. Up to 2,000 characters.</p>
        </div>
        {error && <p id="lead-activity-error" role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => { if (!pending.current) onClose() }}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save activity"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
```

The ref prevents a second write before React renders the disabled state. Keep
the request payload when retrying the same trimmed note, and do not perform a
follow-up fetch inside the save success path. The saved server record is enough
to update the current view. The controller already returns identical retries as
successful saved records.

- [ ] **Step 4: Run the dialog suite and cover Escape.**

In the dialog tests, exercise Escape before saving and expect `onClose` once.
Use this complete additional case:

```tsx
it("allows Escape before a request starts", async () => {
  const { user, onClose } = setup()
  await user.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledOnce()
  expect(addActivity).not.toHaveBeenCalled()
})
```

```sh
pnpm --filter @keyloop-interview/web test src/admin/leads/ActivityDialog.test.tsx
pnpm --filter @keyloop-interview/web typecheck
```

Expected: failed notes remain editable, retries share an ID until the trimmed
note changes, pending dialogs remain open, success calls onSaved and closes the dialog. Task 6 verifies integration and focus
restoration in the dashboard. Commit only these three owned files:

```sh
git add -- apps/web/src/admin/leads/leads-api.ts apps/web/src/admin/leads/ActivityDialog.tsx apps/web/src/admin/leads/ActivityDialog.test.tsx
git commit -m "feat: log follow-ups with recoverable save errors"
```

## Task 6: Inbox, full lead history and route integration

**Files:** Create `LeadInbox.tsx`, `LeadDetails.tsx`, `LeadsDashboard.tsx`, `leads.css` under `apps/web/src/admin/leads/`; add the route and proxy. Task 5 supplies the HTTP client and ActivityDialog.

- [ ] **Step 1: Add initial UI tests before implementation.**

Create `apps/web/src/admin/leads/LeadsDashboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LazyMotion, domAnimation, MotionConfig } from "motion/react"
import { LeadsDashboard } from "./LeadsDashboard"
import { listLeads, getLead, addActivity, type LeadDetails } from "./leads-api"

vi.mock("./leads-api", async importOriginal => ({
  ...await importOriginal<typeof import("./leads-api")>(),
  listLeads: vi.fn(), getLead: vi.fn(), addActivity: vi.fn(),
}))
const alex: LeadDetails = {
  id: "10000000-0000-4000-8000-000000000001", customer_name: "Alex Morgan",
  email: "alex@example.com", phone: "0001", vehicle_interest: "Toyota Corolla",
  enquiry: "Can I test-drive on Saturday?\nPlease discuss part exchange.",
  source: "Dealership website", received_at: "2030-01-01T01:00:00Z", activities: [],
}
const jamie: LeadDetails = { ...alex, id: "10000000-0000-4000-8000-000000000002", customer_name: "Jamie Taylor", email: "jamie@example.com" }
function setup() {
  render(<LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="always"><LeadsDashboard /></MotionConfig></LazyMotion>)
  return userEvent.setup()
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.mocked(listLeads).mockResolvedValue([alex, jamie])
  vi.mocked(getLead).mockImplementation(async id => id === alex.id ? structuredClone(alex) : structuredClone(jamie))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("opens full enquiry and contact details with an empty history", async () => {
  const user = setup()
  await user.click(await screen.findByRole("button", { name: "View Alex Morgan" }))
  const details = within(await screen.findByRole("complementary", { name: "Lead details" }))
  expect(await details.findByText("alex@example.com")).toBeTruthy()
  expect(details.getByText(/Please discuss part exchange/)).toBeTruthy()
  expect(details.getByText("No follow-up activities yet.")).toBeTruthy()
  const nav = within(screen.getByRole("navigation", { name: "Admin navigation" }))
  expect(nav.getByRole("link", { name: "Sales Leads" }).getAttribute("aria-current")).toBe("page")
})
it("shows a recoverable inbox failure and a separate empty state", async () => {
  vi.mocked(listLeads).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce([])
  const user = setup()
  expect(await screen.findByRole("alert")).toBeTruthy()
  await user.click(screen.getByRole("button", { name: "Retry inbox" }))
  expect(await screen.findByText("No sales leads yet.")).toBeTruthy()
})
it("ignores a late response for the previous selection", async () => {
  let resolveAlex!: (value: LeadDetails) => void
  vi.mocked(getLead).mockImplementation(id => id === alex.id
    ? new Promise(resolve => { resolveAlex = resolve })
    : Promise.resolve(structuredClone(jamie)))
  const user = setup()
  await user.click(await screen.findByRole("button", { name: "View Alex Morgan" }))
  await user.click(screen.getByRole("button", { name: "View Jamie Taylor" }))
  expect(await screen.findByText("jamie@example.com")).toBeTruthy()
  resolveAlex(structuredClone(alex))
  await waitFor(() => expect(screen.queryByText("alex@example.com")).toBeNull())
})
it("saves a note, renders the server result and reads saved history after remount", async () => {
  const activity = { id: crypto.randomUUID(), lead_id: alex.id, note: "Called customer", created_at: "2030-01-02T01:00:00Z" }
  vi.mocked(addActivity).mockResolvedValue(activity)
  const user = setup()
  await user.click(await screen.findByRole("button", { name: "View Alex Morgan" }))
  const trigger = await screen.findByRole("button", { name: "Log activity" })
  await user.click(trigger)
  await user.type(screen.getByLabelText("Activity note"), "Called customer")
  await user.click(screen.getByRole("button", { name: "Save activity" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(document.activeElement).toBe(trigger)
  expect(screen.getByText("Called customer")).toBeTruthy()
  expect(screen.getByRole("status").textContent).toMatch(/Activity saved/)
  cleanup()
  vi.mocked(getLead).mockResolvedValue({ ...alex, activities: [activity] })
  const nextUser = setup()
  await nextUser.click(await screen.findByRole("button", { name: "View Alex Morgan" }))
  expect(await screen.findByText("Called customer")).toBeTruthy()
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/leads/LeadsDashboard.test.tsx`.
Expected initial missing-module failures. The remount test proves re-fetching,
not database durability; Task 3 and Task 7 prove actual persistence.

- [ ] **Step 2: Write the inbox and detail/history display components.**

`apps/web/src/admin/leads/LeadInbox.tsx`:

```tsx
import { Button } from "@keyloop-interview/ui/components/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@keyloop-interview/ui/components/table"
import { formatLeadTime, type LeadSummary } from "./leads-api"

export function LeadInbox({ leads, selectedId, onSelect }: {
  leads: LeadSummary[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  if (!leads.length) return <p className="p-6 text-sm text-muted-foreground">No sales leads yet.</p>
  return (
    <Table aria-label="Sales lead inbox">
      <TableHeader><TableRow>
        <TableHead scope="col">Customer</TableHead><TableHead scope="col">Enquiry</TableHead>
        <TableHead scope="col">Received</TableHead><TableHead scope="col">Action</TableHead>
      </TableRow></TableHeader>
      <TableBody>{leads.map(lead => <TableRow key={lead.id} data-state={lead.id === selectedId ? "selected" : undefined}>
        <TableCell><span className="font-semibold">{lead.customer_name}</span><span className="mt-1 block text-xs text-muted-foreground">{lead.vehicle_interest}</span></TableCell>
        <TableCell><p className="lead-summary">{lead.enquiry}</p></TableCell>
        <TableCell><time dateTime={lead.received_at} className="whitespace-nowrap">{formatLeadTime(lead.received_at)}</time></TableCell>
        <TableCell><Button size="sm" variant="link" aria-label={`View ${lead.customer_name}`} onClick={() => onSelect(lead.id)}>View</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  )
}
```

`apps/web/src/admin/leads/LeadDetails.tsx`:

```tsx
import { Button } from "@keyloop-interview/ui/components/button"
import { formatLeadTime, type LeadDetails as LeadRecord } from "./leads-api"

export function LeadDetails({ lead, onLog }: { lead: LeadRecord; onLog: () => void }) {
  return <>
    <div className="flex items-start justify-between gap-3">
      <div><p className="admin-eyebrow">LEAD DETAILS</p><h2 className="font-heading text-xl font-semibold">{lead.customer_name}</h2></div>
      <Button onClick={onLog}>Log activity</Button>
    </div>
    <dl className="lead-facts mt-5">
      {[
        ["Reference", lead.id], ["Email", lead.email], ["Phone", lead.phone],
        ["Vehicle of interest", lead.vehicle_interest], ["Source", lead.source],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div><dt>Received · Asia/Ho_Chi_Minh</dt><dd><time dateTime={lead.received_at}>{formatLeadTime(lead.received_at)}</time></dd></div>
    </dl>
    <section className="lead-section" aria-labelledby="lead-enquiry-heading">
      <h3 id="lead-enquiry-heading">Original enquiry</h3><p className="lead-note">{lead.enquiry}</p>
    </section>
    <section className="lead-section" aria-labelledby="lead-history-heading">
      <h3 id="lead-history-heading">Follow-up history</h3>
      <p className="mb-4 text-xs text-muted-foreground">Oldest first · Asia/Ho_Chi_Minh</p>
      {lead.activities.length ? <ol className="space-y-5">{lead.activities.map(activity => <li key={activity.id} className="border-l-2 border-primary/30 pl-4">
        <time className="text-xs text-muted-foreground" dateTime={activity.created_at}>{formatLeadTime(activity.created_at)}</time>
        <p className="lead-note mt-1">{activity.note}</p>
      </li>)}</ol> : <p className="text-sm text-muted-foreground">No follow-up activities yet.</p>}
    </section>
  </>
}
```

- [ ] **Step 3: Write dashboard state and guard superseded reads.**

`apps/web/src/admin/leads/LeadsDashboard.tsx`:

```tsx
import { useEffect, useState } from "react"
import { Badge } from "@keyloop-interview/ui/components/badge"
import { Button } from "@keyloop-interview/ui/components/button"
import { Card, CardContent } from "@keyloop-interview/ui/components/card"
import { AdminLayout } from "../AdminLayout"
import { LeadInbox } from "./LeadInbox"
import { LeadDetails } from "./LeadDetails"
import { ActivityDialog } from "./ActivityDialog"
import { getLead, listLeads, type Activity, type LeadDetails as LeadRecord, type LeadSummary } from "./leads-api"
import "./leads.css"

export function LeadsDashboard() {
  const [leads, setLeads] = useState<LeadSummary[] | null>(null)
  const [inboxError, setInboxError] = useState("")
  const [inboxAttempt, setInboxAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LeadRecord | null>(null)
  const [detailError, setDetailError] = useState("")
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [dialogLead, setDialogLead] = useState<LeadRecord | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    const oldTitle = document.title
    document.title = "Sales Leads · Keyloop"
    return () => { document.title = oldTitle }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLeads(null); setInboxError("")
    listLeads(controller.signal).then(value => { if (active) setLeads(value) })
      .catch(error => { if (active) setInboxError(error instanceof Error ? error.message : "Unable to load leads.") })
    return () => { active = false; controller.abort() }
  }, [inboxAttempt])
  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    let active = true
    setDetail(null); setDetailError("")
    getLead(selectedId, controller.signal).then(value => { if (active) setDetail(value) })
      .catch(error => { if (active) setDetailError(error instanceof Error ? error.message : "Unable to load this lead.") })
    return () => { active = false; controller.abort() }
  }, [selectedId, detailAttempt])

  function select(id: string) {
    setNotice(""); setDetail(null); setDetailError("")
    if (id === selectedId) setDetailAttempt(value => value + 1)
    else setSelectedId(id)
  }
  function saved(activity: Activity) {
    setDetail(current => current?.id === activity.lead_id ? {
      ...current,
      activities: [...current.activities.filter(entry => entry.id !== activity.id), activity]
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)),
    } : current)
    setNotice("Activity saved to the local database.")
  }
  const visibleDetail = detail?.id === selectedId ? detail : null
  return (
    <AdminLayout activePage="leads">
      <header className="admin-header"><div><p className="admin-eyebrow">DEMAND / SALES</p><h1>Sales Leads</h1>
        <p className="mt-2 text-sm text-muted-foreground">Website enquiries and follow-up history</p></div><Badge variant="outline">Fictional leads · saved activities</Badge></header>
      <Card className="gap-0 py-0"><CardContent className="p-4 sm:p-6">
        <div className="leads-workspace">
          <section className="min-w-0" aria-labelledby="lead-inbox-heading"><h2 id="lead-inbox-heading" className="mb-4 font-heading text-lg font-semibold">Lead inbox</h2>
            {inboxError ? <div role="alert"><p>{inboxError}</p><Button variant="outline" onClick={() => setInboxAttempt(value => value + 1)}>Retry inbox</Button></div>
              : leads === null ? <p>Loading leads…</p>
              : <LeadInbox leads={leads} selectedId={selectedId} onSelect={select} />}
          </section>
          <aside className="lead-details" aria-label="Lead details" aria-busy={Boolean(selectedId && !visibleDetail && !detailError)}>
            {!selectedId ? <p className="text-sm text-muted-foreground">Select a lead to view the enquiry and follow-up history.</p>
              : detailError ? <div role="alert"><p>{detailError}</p><Button variant="outline" onClick={() => setDetailAttempt(value => value + 1)}>Retry lead details</Button></div>
              : !visibleDetail ? <p>Loading lead details…</p>
              : <LeadDetails lead={visibleDetail} onLog={() => setDialogLead(visibleDetail)} />}
          </aside>
        </div>
      </CardContent></Card>
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm font-medium">{notice}</p>
      <footer className="admin-page-footer"><span>Keyloop · Sales operations</span><span>Local demo · no live website connection</span></footer>
      {dialogLead && <ActivityDialog lead={dialogLead} onSaved={saved} onClose={() => setDialogLead(null)} />}
    </AdminLayout>
  )
}
```

All detail error/loading states belong to the selected ID; old details cannot
remain visible during a new read. Aborting an old GET does not replace the
active flag, because mocks or a completed network response may ignore abort.

`apps/web/src/admin/leads/leads.css`:

```css
.leads-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr); gap: var(--kl-space-6); }
.lead-details { min-width: 0; border-left: 1px solid var(--border); padding-left: var(--kl-space-6); }
.lead-summary { max-width: 25ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lead-note { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.7; }
.lead-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--kl-space-4); }
.lead-facts dt { color: var(--muted-foreground); font-size: 11px; margin-bottom: 3px; }
.lead-facts dd { font-size: 13px; overflow-wrap: anywhere; }
.lead-section { margin-top: var(--kl-space-6); padding-top: var(--kl-space-5); border-top: 1px solid var(--border); }
.lead-section h3 { font-weight: 600; font-size: 14px; margin-bottom: var(--kl-space-3); }
@media (max-width: 1200px) {
  .leads-workspace { grid-template-columns: minmax(0, 1fr); }
  .lead-details { border-left: 0; border-top: 1px solid var(--border); padding: var(--kl-space-6) 0 0; }
}
@media (max-width: 520px) { .lead-facts { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 4: Add the exact lazy route and local API proxy.**

Add this alongside existing lazy imports in `apps/web/src/main.tsx`:

```tsx
const LeadsDashboard = lazy(() => import("./admin/leads/LeadsDashboard").then(module => ({ default: module.LeadsDashboard })))
```

Add this first branch to the current pathname selection, retaining all later branches and existing Suspense/Motion/StrictMode providers:

```tsx
window.location.pathname === "/admin/leads" ? <LeadsDashboard /> :
```

Merge `server.proxy` into `apps/web/vite.config.ts`, retaining plugins and any
existing server configuration. Use the existing API port if concurrent work has
set one; otherwise use the backend's default 3000:

```ts
server: {
  proxy: {
    "/api": {
      target: "http://127.0.0.1:3000",
      changeOrigin: true,
      rewrite: path => path.replace(/^\/api/, ""),
    },
  },
},
```

- [ ] **Step 5: Run tests and commit owned feature files.**

```sh
pnpm --filter @keyloop-interview/web test src/admin/leads/LeadsDashboard.test.tsx
pnpm --filter @keyloop-interview/web typecheck
git add -- apps/web/src/admin/leads/LeadInbox.tsx apps/web/src/admin/leads/LeadDetails.tsx apps/web/src/admin/leads/LeadsDashboard.tsx apps/web/src/admin/leads/leads.css apps/web/src/admin/leads/LeadsDashboard.test.tsx
git commit -m "feat: add sales lead inbox and complete history view"
```

## Task 7: Setup documentation, complete verification and live acceptance

**Files:** Update the existing root, web and API READMEs with the exact setup and limitations. Preserve unrelated documentation. No application-wide cleanup.

- [ ] **Step 1: Document commands that actually load configuration.**

Add this text to the relevant README sections, adapting ports only to the verified
local configuration. All commands in the API block run from `apps/api`:

````markdown
### Sales Leads demo

Open `/admin/leads` for seeded website enquiries, full details and saved activity
history. The component library at `/` and booking page at `/admin/bookings` remain
available. Bookings are session-only; lead activities use the local database.

Start the identified local Supabase project using the loopback network:

```sh
supabase start --network-id keyloop-interview-local
supabase migration up --local
```

Seed fictional leads explicitly with `supabase/seeds/sales-leads.sql` through the
identified local PostgreSQL container. Repeating that seed preserves saved rows.
Do not reset an existing database. Ordinary application startup does not seed.

Copy `apps/api/.env.example` to `apps/api/.env`, then privately fill in this local
project's URL and server service-role key. Never use `VITE_` for this key.

From `apps/api`, load the env file explicitly:

```sh
node --env-file=.env ./node_modules/@nestjs/cli/bin/nest.js start --watch
```

From the repository root, start only the frontend:

```sh
pnpm --filter @keyloop-interview/web dev
```

The frontend's `/api` proxy targets the API on loopback port 3000. If you select a
different API port, update that proxy target to match. These separate commands
load the API env file deliberately; bare root `pnpm dev` does not load it itself.
Use an available frontend port if 5173 belongs to another running preview.

For a built API, verify the actual emitted entry path before running it. The
expected path from the current build configuration is `dist/main.js`:

```sh
pnpm build
node --env-file=.env dist/main.js
```

The real database suite uses a separate project named `keyloop-leads-tests` and
`.env.leads-test`, and is never part of ordinary unit tests:

```sh
pnpm test:leads-db
```

This is a loopback-only demo using fictional customer data. There is no login,
website ingestion, automatic contacting, activity editing/deletion or public
deployment. Do not use real customer data or expose this API publicly.
````

Before documenting `dist/main.js`, run the actual build and inspect the output.
If the current compiler emits a different path, correct the README and existing
start:prod script together. Do not infer the output solely from old scripts.

- [ ] **Step 2: Run all required checks and inspect introduced failures.**

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @keyloop-interview/api test:e2e
```

Then run the opt-in database suite using the dedicated test environment. Existing
unrelated failures are reported separately with the actual command and error;
do not silently ignore them. Do not add a new lint framework because some
packages have no lint script. New backend routes must pass the API's existing
type-aware lint.

Check that new database/env configuration fails safely when missing, that the
root endpoint remains `Hello World!`, and that frontend build output contains no
service-role credential. Search for the env variable name and inspect client
imports; never print the credential itself.

- [ ] **Step 3: Verify the actual browser flow with the real local database.**

Use the available browser tool on the actual running URL, not a test render:

1. Open `/admin/leads`; confirm all seeded inbox records, empty selection and
   active Sales Leads navigation. Open a long enquiry and inspect full text.
2. Open Jamie and confirm the two seeded activities are oldest first. Open Alex
   and confirm the initial empty history.
3. Log a distinctive fictional note on Alex. Confirm the dialog closes only on
   success, keyboard focus returns, and the note appears exactly once.
4. Refresh, reopen Alex and confirm the note remains. Open Sam and confirm the
   same note is absent.
5. Stop and restart **only this task's managed API process**. Reopen Alex and
   confirm the note remains.
6. With the exact local Supabase project identified, use ordinary `supabase stop`
   and `supabase start --network-id keyloop-interview-local` (no reset, no
   `--no-backup`). Reopen the lead and confirm the note survives this database
   restart. Do this against a feature-owned stack; if the demo shares an active
   stack with another operator, demonstrate the same restart on the isolated
   test stack instead and state that boundary.
7. Briefly stop only the task-owned API process, attempt another save, and confirm
   the note is retained with a visible error. Restart the API and retry once;
   confirm one stored record. Never stop an unrelated preview or API.
8. At desktop, 390px and 320px, verify details stack below the inbox, table scroll
   stays inside its container and document width equals viewport width. Check
   keyboard View/Log activity/Cancel/Escape and focus restoration.
9. Open `/admin/bookings`; verify calendar/list tabs, booking detail popover,
   Resources and Opening hours still work. Open `/` to verify the showcase.

The user declined visual brainstorming; that does not prohibit ordinary browser
verification. Do not generate design alternatives or mockups.

- [ ] **Step 4: Review the implementation against the spec before completion.**

Use the verification-before-completion skill and review changed sources locally.
If using inline execution, review inline without spawning agents. Confirm:

- No browser Supabase credential, anonymous lead access, reset-on-startup,
  overwrite-all activity array, or fabricated logged-in author.
- History belongs to the selected lead; reads cannot overwrite a newer selection.
- Equal timestamp ordering is stable; duplicates are constrained by the database.
- Validation and failed-save behavior work in actual tests, not only source.
- The feature integrates with the latest shell and routing, preserving concurrent
  inventory or booking work. No unrelated untracked files were staged.

- [ ] **Step 5: Record the actual evidence and deliver the working route.**

Append an implementation evidence section to this plan with the actual passing
commands, any failures/blockers, local URL, database project identity/ports,
restart outcome and browser checks. Include no credentials or customer contents.
Do not mark unchecked steps complete. Update the spec status after implementation
only when its acceptance criteria have actually passed.

Inspect `git diff --check` for tracked modifications and inspect newly created
files separately. Stage only files owned by this task. Where an integration file
was already untracked, explain the working-tree change and avoid a surprise commit
of someone else's full application. Leave running task-owned demo services
available if useful; stop temporary test services with data-preserving commands.

## Plan self-review and coverage map

| Spec requirement | Planned proof |
| --- | --- |
| Inbox, full details, chronological history | Tasks 2, 3, 6 and live steps 1–2 |
| Durable append-only follow-ups | Migration, service INSERT, database concurrent-write and restart checks |
| Blank/long/invalid note rejection, missing leads | Controller table tests and database constraints |
| Identical retry versus conflicting ID | Concurrent database test and dialog retry-ID tests |
| Error recovery without lost drafts | ActivityDialog tests and live save failure/retry |
| Selection and stale-read protection | Dashboard out-of-order response test |
| No false save failure from a refresh | Save success uses the returned record without a second read |
| Keyboard, focus, responsive layout | Dialog tests, booking regression, browser step 8 |
| Existing admin shell and routes | Shared layout, booking navigation test, browser step 9 |
| Safe fictional local setup and RLS | Loopback provider/config, anonymous database denial test |
| Non-overwriting repeatable seed | Explicit SQL with ON CONFLICT DO NOTHING, repeated seed check |

No intentionally deferred requirement remains inside the approved demo scope.
Implementation still needs runtime verification; code blocks in a plan are not
evidence of passing tests.

Planning self-review: tasks are ordered database → API → real database checks →
shared shell → HTTP client/dialog → complete page → live verification. The plan
was checked for undefined local imports, duplicated file ownership, stale route
replacement, placeholder instructions, fixture cleanup scope and CLI commands.
The installed Node rejected `--env-file` inside NODE_OPTIONS during planning;
all final commands use Node's direct `--env-file` argument instead. No database
was started and no application test/build was run for this planning task.

## References checked during planning

- [Supabase insert API](https://supabase.com/docs/reference/javascript/insert): append rows and request returned records with `.select()`.
- [Supabase local development](https://supabase.com/docs/guides/local-development): Docker-backed local stack and CLI setup. Exact flags were also checked against installed CLI 2.117.0 help.
- [Docker bridge host binding](https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address): loopback network option. Actual published addresses must still be inspected after startup.
