import { DocumentAdapterFactory } from './document-adapter.factory.js';
import { SalesDocumentAdapter } from './adapters/sales-document.adapter.js';
import { ServiceDocumentAdapter } from './adapters/service-document.adapter.js';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service.js';
import {
  DocumentSourcesClient,
  createDocumentSources,
} from './document-sources.client.js';
import { normalizeVin } from './document-model.js';

const vin = '1HGCM82633A004352';
const adapters = new DocumentAdapterFactory([
  new SalesDocumentAdapter(),
  new ServiceDocumentAdapter(),
]);
const config = {
  urls: {
    sales: 'http://127.0.0.1:3006/mock/sales',
    service: 'http://127.0.0.1:3006/mock/service',
  },
  timeoutMs: 3000,
};
const sales = {
  vin,
  documents: [
    {
      document_id: '101',
      title: 'Sales invoice',
      document_type: 'Invoice',
      issued_at: '2026-10-20',
      body: 'Fictional sales invoice',
    },
  ],
};
const service = {
  vehicleVin: vin,
  records: [
    {
      reference: '101',
      description: 'Repair order',
      category: 'Repair order',
      date: '2026-10-21',
      content: 'Fictional service record',
    },
  ],
};
const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
afterEach(() => vi.unstubAllGlobals());
it('normalizes VINs and rejects invalid input before requesting either system', async () => {
  expect(normalizeVin(' 1hgcm82633a004352 ')).toBe(vin);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const value of ['123', '1HGCM82633A00435I', ['invalid']]) {
    await expect(
      new DocumentsService(new DocumentSourcesClient(config, adapters)).search(
        value,
      ),
    ).rejects.toMatchObject({ status: 400 });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it('starts both HTTP requests before awaiting either and preserves matching source IDs', async () => {
  const release: ((value: Response) => void)[] = [];
  const fetcher = vi.fn<typeof fetch>(
    () => new Promise<Response>((resolve) => release.push(resolve)),
  );
  vi.stubGlobal('fetch', fetcher);
  const pending = new DocumentsService(
    new DocumentSourcesClient(config, adapters),
  ).search(vin);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    config.urls.sales + '/vehicles/' + vin + '/documents',
  );
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    config.urls.service + '/vehicles/' + vin + '/documents',
  );
  release[0]!(response(sales));
  release[1]!(response(service));
  const result = await pending;
  expect(result.documents.map((d) => d.id)).toEqual([
    'service:101',
    'sales:101',
  ]);
  expect(result.documents[0]).toMatchObject({
    source: 'service',
    content: 'Fictional service record',
    vin,
  });
  expect(result.sources).toEqual({
    sales: { label: 'Sales System', status: 'ok', count: 1 },
    service: { label: 'Service System', status: 'ok', count: 1 },
  });
});
it('returns available documents when another source fails without exposing its error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(sales))
      .mockRejectedValueOnce(new Error('secret upstream hostname')),
  );
  const result = await new DocumentsService(
    new DocumentSourcesClient(config, adapters),
  ).search(vin);
  expect(result.documents).toHaveLength(1);
  expect(result.sources.service).toEqual({
    label: 'Service System',
    status: 'unavailable',
    count: 0,
  });
  expect(JSON.stringify(result)).not.toContain('secret');
});
it('reports both-source failure as a safe 502', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('private upstream failure')),
  );
  await expect(
    new DocumentsService(new DocumentSourcesClient(config, adapters)).search(
      vin,
    ),
  ).rejects.toMatchObject({
    status: 502,
    message: 'All document systems are unavailable. Please try again.',
  });
});
it.each([
  { ...service, vehicleVin: 'WVWZZZ1JZXW000001' },
  { vehicleVin: vin, records: [{ ...service.records[0], date: '2026-02-30' }] },
  { vehicleVin: vin, records: [{ ...service.records[0], content: 42 }] },
  { vehicleVin: vin, records: [service.records[0], service.records[0]] },
])('treats malformed service data as unavailable', async (bad) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(sales))
      .mockResolvedValueOnce(response(bad)),
  );
  expect(
    (
      await new DocumentsService(
        new DocumentSourcesClient(config, adapters),
      ).search(vin)
    ).sources.service.status,
  ).toBe('unavailable');
});
it('distinguishes an empty successful source from a failed source', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response({ vin, documents: [] }))
      .mockResolvedValueOnce(response({ vehicleVin: vin, records: [] })),
  );
  expect(
    await new DocumentsService(
      new DocumentSourcesClient(config, adapters),
    ).search(vin),
  ).toEqual({
    vin,
    documents: [],
    sources: {
      sales: { label: 'Sales System', status: 'ok', count: 0 },
      service: { label: 'Service System', status: 'ok', count: 0 },
    },
  });
});
it('keeps upstream configuration restricted to local mock systems', () => {
  expect(createDocumentSources({ PORT: '3006' }).urls.sales).toBe(
    config.urls.sales,
  );
  expect(() =>
    createDocumentSources({
      DOCUMENT_SALES_API_URL: 'https://external.example',
    }),
  ).toThrow(/loopback/);
});

it('starts both all-document HTTP requests together and preserves per-document VINs', async () => {
  const release: ((value: Response) => void)[] = [];
  const fetcher = vi.fn<typeof fetch>(
    () => new Promise((resolve) => release.push(resolve)),
  );
  vi.stubGlobal('fetch', fetcher);
  const pending = new DocumentsService(
    new DocumentSourcesClient(config, adapters),
  ).search(undefined);
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    config.urls.sales + '/documents',
    config.urls.service + '/documents',
  ]);
  release[0]!(
    response({ vin: null, documents: [{ ...sales.documents[0], vin }] }),
  );
  release[1]!(
    response({
      vehicleVin: null,
      records: [{ ...service.records[0], vehicleVin: 'WVWZZZ1JZXW000001' }],
    }),
  );
  const result = await pending;
  expect(result.vin).toBeNull();
  expect(result.documents.map((doc) => doc.vin)).toEqual([
    'WVWZZZ1JZXW000001',
    vin,
  ]);
});
it('rejects a document without a valid VIN in the all-vehicle list', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        response({
          vin: null,
          documents: [{ ...sales.documents[0], vin: 'invalid' }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          vehicleVin: null,
          records: [{ ...service.records[0], vehicleVin: vin }],
        }),
      ),
  );
  const result = await new DocumentsService(
    new DocumentSourcesClient(config, adapters),
  ).search(undefined);
  expect(result.sources.sales.status).toBe('unavailable');
  expect(result.documents).toHaveLength(1);
});

it('merges normalized source documents without HTTP and sorts ties by ID without mutating either source', async () => {
  const first = {
    id: 'sales:101',
    vin,
    source: 'sales' as const,
    title: 'First sales invoice',
    type: 'Invoice',
    issuedAt: '2026-10-20',
    content: 'Fictional invoice',
  };
  const second = { ...first, id: 'sales:102', title: 'Second sales invoice' };
  const newest = {
    ...first,
    id: 'service:101',
    source: 'service' as const,
    issuedAt: '2026-10-21',
  };
  const salesDocuments = Object.freeze([second, first]);
  const serviceDocuments = Object.freeze([newest]);
  const load = vi
    .fn()
    .mockResolvedValueOnce(salesDocuments)
    .mockResolvedValueOnce(serviceDocuments);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const result = await new DocumentsService({
    load,
    list: () => [
      { id: 'sales', label: 'Sales System' },
      { id: 'service', label: 'Service System' },
    ],
  }).search(vin, 'Bearer source-test-jwt');
  expect(load.mock.calls).toEqual([
    ['sales', vin, 'Bearer source-test-jwt'],
    ['service', vin, 'Bearer source-test-jwt'],
  ]);
  expect(result.documents.map((doc) => doc.id)).toEqual([
    'service:101',
    'sales:101',
    'sales:102',
  ]);
  expect(salesDocuments.map((doc) => doc.id)).toEqual([
    'sales:102',
    'sales:101',
  ]);
  expect(serviceDocuments).toEqual([newest]);
  expect(result.sources).toEqual({
    sales: { label: 'Sales System', status: 'ok', count: 2 },
    service: { label: 'Service System', status: 'ok', count: 1 },
  });
  expect(fetcher).not.toHaveBeenCalled();
});
