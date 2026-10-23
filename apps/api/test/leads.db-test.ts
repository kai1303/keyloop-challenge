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
if (
  process.env.LEADS_TEST_PROJECT !== 'keyloop-leads-tests' ||
  !url ||
  !key ||
  !anonKey ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
) {
  throw new Error(
    'Provide the dedicated loopback keyloop-leads-tests configuration.',
  );
}
const db = createClient(url, key, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const leadA = randomUUID();
const leadB = randomUUID();
let app: INestApplication;
async function startApp() {
  const module = await Test.createTestingModule({ imports: [LeadsModule] })
    .overrideProvider(LEADS_DB)
    .useValue(db)
    .compile();
  const instance = module.createNestApplication();
  await instance.init();
  return instance;
}
beforeAll(async () => {
  const { error } = await db.from('sales_leads').insert(
    [leadA, leadB].map((id, index) => ({
      id,
      customer_name: `Isolated test ${index}`,
      email: 'test@example.com',
      phone: '000',
      vehicle_interest: 'Corolla',
      enquiry: 'Test enquiry',
      source: 'Automated test',
      received_at:
        index === 0 ? '2030-01-02T00:00:00Z' : '2030-01-01T00:00:00Z',
    })),
  );
  if (error)
    throw new Error('Test fixture insertion failed; check migrations.');
  app = await startApp();
});
afterAll(async () => {
  await app?.close();
  const activities = await db
    .from('sales_lead_activities')
    .delete()
    .in('lead_id', [leadA, leadB]);
  const leads = await db.from('sales_leads').delete().in('id', [leadA, leadB]);
  if (activities.error || leads.error)
    throw new Error('Isolated fixture cleanup failed.');
});
it('sorts inbox leads newest first', async () => {
  const response = await request(app.getHttpServer()).get('/leads').expect(200);
  const ids = response.body.leads.map((lead: { id: string }) => lead.id);
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
  expect(writes.map((value) => value.status).sort((a, b) => a - b)).toEqual([
    200, 201, 201,
  ]);
  const history = await request(app.getHttpServer())
    .get(`/leads/${leadA}`)
    .expect(200);
  expect(history.body.activities).toHaveLength(2);
  expect(
    new Set(history.body.activities.map((entry: { id: string }) => entry.id))
      .size,
  ).toBe(2);
  const times = history.body.activities.map((entry: { created_at: string }) =>
    Date.parse(entry.created_at),
  );
  expect(times).toEqual([...times].sort((a, b) => a - b));
  const other = await request(app.getHttpServer())
    .get(`/leads/${leadB}`)
    .expect(200);
  expect(other.body.activities).toEqual([]);
  await request(app.getHttpServer())
    .post(path)
    .send({ ...first, note: 'Changed' })
    .expect(409);
  await request(app.getHttpServer())
    .post(`/leads/${leadB}/activities`)
    .send(first)
    .expect(409);
  await app.close();
  app = await startApp();
  const reopened = await request(app.getHttpServer())
    .get(`/leads/${leadA}`)
    .expect(200);
  expect(reopened.body.activities).toHaveLength(2);
});
it('rejects missing leads and database-invalid notes', async () => {
  await request(app.getHttpServer()).get(`/leads/${randomUUID()}`).expect(404);
  await request(app.getHttpServer())
    .post(`/leads/${randomUUID()}/activities`)
    .send({ id: randomUUID(), note: 'Called' })
    .expect(404);
  for (const note of ['', '  ', '\n\t', 'x'.repeat(2001)]) {
    const result = await db
      .from('sales_lead_activities')
      .insert({ id: randomUUID(), lead_id: leadB, note });
    expect(result.error?.code).toBe('23514');
  }
});
it('uses activity ID to order equal timestamps deterministically', async () => {
  const ids = [
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
  ];
  const { error } = await db.from('sales_lead_activities').insert(
    ids.map((id) => ({
      id,
      lead_id: leadB,
      note: 'Equal timestamp fixture',
      created_at: '2030-01-01T00:00:00Z',
    })),
  );
  expect(error).toBeNull();
  const response = await request(app.getHttpServer())
    .get(`/leads/${leadB}`)
    .expect(200);
  expect(
    response.body.activities.map((entry: { id: string }) => entry.id),
  ).toEqual([...ids].sort());
});
it('does not expose lead reads or writes to the anonymous database client', async () => {
  expect((await anon.from('sales_leads').select('*')).error).toBeTruthy();
  expect(
    (
      await anon
        .from('sales_lead_activities')
        .insert({ id: randomUUID(), lead_id: leadA, note: 'Blocked' })
    ).error,
  ).toBeTruthy();
});
