import { DocumentAdapterFactory } from './document-adapter.factory.js';
import { SalesDocumentAdapter } from './adapters/sales-document.adapter.js';
import { ServiceDocumentAdapter } from './adapters/service-document.adapter.js';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentSourcesClient } from './document-sources.client.js';
import {
  DEMO_VIN,
  SALES_ONLY_VIN,
  salesDocuments,
  serviceDocuments,
} from './mock-documents.js';

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
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

it.each(['sales', 'service'] as const)(
  'normalizes the %s format at the HTTP boundary',
  async (source) => {
    const raw =
      source === 'sales'
        ? salesDocuments(DEMO_VIN)
        : serviceDocuments(DEMO_VIN);
    const fetcher = vi.fn().mockResolvedValue(response(raw));
    vi.stubGlobal('fetch', fetcher);
    const documents = await new DocumentSourcesClient(config, adapters).load(
      source,
      DEMO_VIN,
    );
    expect(documents).toHaveLength(2);
    expect(documents[0]).toEqual({
      id: source + ':101',
      vin: DEMO_VIN,
      source,
      title: source === 'sales' ? 'Vehicle sales invoice' : 'Service invoice',
      type: 'Invoice',
      issuedAt: source === 'sales' ? '2026-10-10' : '2026-10-20',
      content:
        source === 'sales'
          ? salesDocuments(DEMO_VIN).documents[0]!.body
          : serviceDocuments(DEMO_VIN).records[0]!.content,
    });
    expect(fetcher).toHaveBeenCalledWith(
      config.urls[source] + '/vehicles/' + DEMO_VIN + '/documents',
      {
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
        redirect: 'error',
      },
    );
  },
);
it('retains each document VIN and unique ID in an all-vehicle response', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      vin: null,
      documents: [
        ...salesDocuments(DEMO_VIN).documents,
        ...salesDocuments(SALES_ONLY_VIN).documents,
      ],
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const documents = await new DocumentSourcesClient(config, adapters).load(
    'sales',
    null,
  );
  expect(fetcher.mock.calls[0]![0]).toBe(config.urls.sales + '/documents');
  expect(documents.map((doc) => doc.vin)).toEqual([
    DEMO_VIN,
    DEMO_VIN,
    SALES_ONLY_VIN,
    SALES_ONLY_VIN,
  ]);
  expect(new Set(documents.map((doc) => doc.id)).size).toBe(4);
});
it('rejects malformed source payloads before they reach aggregation', async () => {
  const malformed = serviceDocuments(DEMO_VIN);
  malformed.records[0]!.date = '2026-02-30';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(malformed)));
  await expect(
    new DocumentSourcesClient(config, adapters).load('service', DEMO_VIN),
  ).rejects.toThrow('Invalid document date');
});
it('rejects failed HTTP responses for the aggregation service to handle', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ message: 'private error' }, 503)),
  );
  await expect(
    new DocumentSourcesClient(config, adapters).load('sales', null),
  ).rejects.toThrow('Document system unavailable');
});

it('rejects an unregistered configured source', () => {
  expect(
    () =>
      new DocumentSourcesClient(
        {
          urls: { unknown: 'http://127.0.0.1:3006/mock/unknown' },
          timeoutMs: 100,
        },
        adapters,
      ),
  ).toThrow('Unknown document source');
});
it('keeps additional configured source URLs restricted to loopback', async () => {
  const client = new DocumentSourcesClient(
    { urls: { sales: 'https://external.example' }, timeoutMs: 100 },
    adapters,
  );
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(client.load('sales', null)).rejects.toThrow('loopback');
  expect(fetcher).not.toHaveBeenCalled();
});
