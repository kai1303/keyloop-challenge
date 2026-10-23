import { DOCUMENT_ADAPTERS } from '../src/documents/document-adapter.factory.js';
import { SalesDocumentAdapter } from '../src/documents/adapters/sales-document.adapter.js';
import { ServiceDocumentAdapter } from '../src/documents/adapters/service-document.adapter.js';
import {
  documentRecord,
  normalizeDocuments,
} from '../src/documents/document-normalizer.js';
import type { DocumentSourceAdapter } from '../src/documents/document-source.adapter.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DocumentsModule } from '../src/documents/documents.module.js';
import { DOCUMENT_SOURCES } from '../src/documents/document-sources.client.js';
import {
  DEMO_VIN,
  SALES_ONLY_VIN,
  SERVICE_ONLY_VIN,
  salesDocuments,
  serviceDocuments,
} from '../src/documents/mock-documents.js';

const financeAdapter: DocumentSourceAdapter = {
  id: 'finance',
  label: 'Finance System',
  path: (vin) => (vin === null ? '/agreements' : '/agreements?vehicle=' + vin),
  normalize(body, vin) {
    const payload = documentRecord(body);
    return normalizeDocuments(
      this.id,
      vin,
      payload.vehicle,
      payload.items,
      (row) => ({
        id: row.key,
        vin: row.vehicle,
        title: row.name,
        type: row.kind,
        issuedAt: row.created,
        content: row.text,
      }),
    );
  },
};
let app: INestApplication;
const sources = {
  urls: { sales: '', service: '' } as Record<string, string>,
  timeoutMs: 1000,
};
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [DocumentsModule] })
    .overrideProvider(DOCUMENT_ADAPTERS)
    .useValue([
      new SalesDocumentAdapter(),
      new ServiceDocumentAdapter(),
      financeAdapter,
    ])
    .overrideProvider(DOCUMENT_SOURCES)
    .useValue(sources)
    .compile();
  app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  sources.urls.sales = origin + '/mock/sales';
  sources.urls.service = origin + '/mock/service';
});
afterAll(async () => {
  await app?.close();
});
const search = (vin = DEMO_VIN) =>
  request(app.getHttpServer()).get('/documents').query({ vin });
function json(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
async function usingMock(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: () => Promise<void>,
  timeoutMs = 1000,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const saved = { urls: { ...sources.urls }, timeoutMs: sources.timeoutMs };
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(sources, {
    urls: { sales: origin + '/sales', service: origin + '/service' },
    timeoutMs,
  });
  try {
    await run();
  } finally {
    Object.assign(sources, saved);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
it('uses both real mock APIs and consolidates source-labelled documents with preview content', async () => {
  const sales = await request(app.getHttpServer())
    .get(`/mock/sales/vehicles/${DEMO_VIN}/documents`)
    .expect(200);
  const service = await request(app.getHttpServer())
    .get(`/mock/service/vehicles/${DEMO_VIN}/documents`)
    .expect(200);
  expect(sales.body.documents).toHaveLength(2);
  expect(service.body.records).toHaveLength(2);
  const result = await search(' ' + DEMO_VIN.toLowerCase() + ' ').expect(200);
  expect(result.body.documents).toHaveLength(4);
  expect(
    new Set(result.body.documents.map((d: { id: string }) => d.id)).size,
  ).toBe(4);
  expect(result.body.documents[0]).toMatchObject({
    id: 'service:101',
    source: 'service',
  });
  expect(result.body.documents[0].content).toContain(DEMO_VIN);
});
it.each([
  [SALES_ONLY_VIN, 'sales'],
  [SERVICE_ONLY_VIN, 'service'],
])('finds records when only one system knows %s', async (vin, source) => {
  const result = await search(vin).expect(200);
  expect(result.body.documents).toHaveLength(2);
  expect(
    result.body.documents.every((d: { source: string }) => d.source === source),
  ).toBe(true);
});
it('returns a genuine empty result for an unknown valid VIN', async () => {
  const result = await search('JH4KA8260MC000000').expect(200);
  expect(result.body.documents).toEqual([]);
  expect(result.body.sources.sales.status).toBe('ok');
  expect(result.body.sources.service.status).toBe('ok');
});
it('dispatches both real HTTP requests before either response is released', async () => {
  const pending: { req: IncomingMessage; res: ServerResponse }[] = [];
  await usingMock(
    (req, res) => {
      pending.push({ req, res });
      if (pending.length === 2)
        for (const item of pending)
          json(
            item.res,
            item.req.url?.startsWith('/sales')
              ? salesDocuments(DEMO_VIN)
              : serviceDocuments(DEMO_VIN),
          );
    },
    async () => {
      await search().expect(200);
      expect(pending).toHaveLength(2);
      expect(pending.some((item) => item.req.url?.startsWith('/sales'))).toBe(
        true,
      );
      expect(pending.some((item) => item.req.url?.startsWith('/service'))).toBe(
        true,
      );
    },
  );
});
it('keeps the successful source when the other responds with an error', async () => {
  await usingMock(
    (req, res) =>
      req.url?.startsWith('/sales')
        ? json(res, salesDocuments(DEMO_VIN))
        : json(res, { message: 'private system error' }, 503),
    async () => {
      const result = await search().expect(200);
      expect(result.body.documents).toHaveLength(2);
      expect(result.body.sources.service.status).toBe('unavailable');
      expect(JSON.stringify(result.body)).not.toContain('private');
    },
  );
});
it('bounds a hung source and returns available documents', async () => {
  await usingMock(
    (req, res) => {
      if (req.url?.startsWith('/sales')) json(res, salesDocuments(DEMO_VIN));
    },
    async () => {
      const result = await search().expect(200);
      expect(result.body.sources).toEqual({
        sales: { label: 'Sales System', status: 'ok', count: 2 },
        service: { label: 'Service System', status: 'unavailable', count: 0 },
      });
    },
    200,
  );
});
it('marks malformed upstream data unavailable', async () => {
  await usingMock(
    (req, res) =>
      json(
        res,
        req.url?.startsWith('/sales')
          ? salesDocuments(DEMO_VIN)
          : { vehicleVin: DEMO_VIN, records: [{}] },
      ),
    async () => {
      const result = await search().expect(200);
      expect(result.body.sources.service.status).toBe('unavailable');
    },
  );
});
it('returns a safe 502 when both sources fail', async () => {
  await usingMock(
    (_req, res) => json(res, { message: 'private upstream error' }, 503),
    async () => {
      const result = await search().expect(502);
      expect(result.body.message).toBe(
        'All document systems are unavailable. Please try again.',
      );
    },
  );
});
it('rejects invalid VINs without calling either system', async () => {
  let hits = 0;
  await usingMock(
    (_req, res) => {
      hits++;
      json(res, {});
    },
    async () => {
      await search('not-a-vin').expect(400);
      expect(hits).toBe(0);
    },
  );
});

it.each([undefined, '   '])(
  'lists every vehicle by default for VIN %s',
  async (vin) => {
    const query = request(app.getHttpServer()).get('/documents');
    const result = await (
      vin === undefined ? query : query.query({ vin })
    ).expect(200);
    expect(result.body.vin).toBeNull();
    expect(result.body.documents).toHaveLength(8);
    expect(
      new Set(result.body.documents.map((doc: { id: string }) => doc.id)).size,
    ).toBe(8);
    expect(
      new Set(result.body.documents.map((doc: { vin: string }) => doc.vin)),
    ).toEqual(new Set([DEMO_VIN, SALES_ONLY_VIN, SERVICE_ONLY_VIN]));
    expect(result.body.sources).toEqual({
      sales: { label: 'Sales System', status: 'ok', count: 4 },
      service: { label: 'Service System', status: 'ok', count: 4 },
    });
  },
);

it.each([DEMO_VIN, null])(
  'adds a third adapter without changing aggregation for VIN %s',
  async (vin) => {
    const pending: { req: IncomingMessage; res: ServerResponse }[] = [];
    await usingMock(
      (req, res) => {
        pending.push({ req, res });
        if (pending.length === 3)
          for (const item of pending) {
            if (item.req.url?.startsWith('/finance')) {
              json(item.res, {
                vehicle: vin,
                items: [
                  {
                    key: '101',
                    vehicle: DEMO_VIN,
                    name: 'Finance agreement',
                    kind: 'Agreement',
                    created: '2026-10-22',
                    text: 'Fictional finance agreement',
                  },
                ],
              });
            } else if (item.req.url?.startsWith('/sales')) {
              json(item.res, { ...salesDocuments(DEMO_VIN), vin });
            } else {
              json(item.res, {
                ...serviceDocuments(DEMO_VIN),
                vehicleVin: vin,
              });
            }
          }
      },
      async () => {
        sources.urls.finance = sources.urls.sales!.replace(/sales$/, 'finance');
        const query = request(app.getHttpServer()).get('/documents');
        const result = await (
          vin === null ? query : query.query({ vin })
        ).expect(200);
        expect(pending).toHaveLength(3);
        expect(
          pending.some(
            ({ req }) => req.url === '/finance' + financeAdapter.path(vin),
          ),
        ).toBe(true);
        expect(result.body.documents).toHaveLength(5);
        expect(result.body.documents[0]).toMatchObject({
          id: 'finance:101',
          source: 'finance',
          vin: DEMO_VIN,
          title: 'Finance agreement',
        });
        expect(result.body.sources.finance).toEqual({
          label: 'Finance System',
          status: 'ok',
          count: 1,
        });
      },
    );
  },
);
