import { expect, it } from 'vitest';
import { DocumentAdapterFactory } from './document-adapter.factory.js';
import { SalesDocumentAdapter } from './adapters/sales-document.adapter.js';
import { ServiceDocumentAdapter } from './adapters/service-document.adapter.js';
import type { DocumentSourceAdapter } from './document-source.adapter.js';

const finance: DocumentSourceAdapter = {
  id: 'finance',
  label: 'Finance System',
  path: () => '/agreements',
  normalize: () => [],
};
it('resolves existing adapters and an additional registered system by ID', () => {
  const sales = new SalesDocumentAdapter();
  const service = new ServiceDocumentAdapter();
  const factory = new DocumentAdapterFactory([sales, service, finance]);
  expect(factory.create('sales')).toBe(sales);
  expect(factory.create('service')).toBe(service);
  expect(factory.create('finance')).toBe(finance);
});
it('rejects unknown source IDs rather than defaulting to another adapter', () => {
  expect(() => new DocumentAdapterFactory([finance]).create('unknown')).toThrow(
    'Unknown document source',
  );
});
it('rejects duplicate registrations', () => {
  expect(() => new DocumentAdapterFactory([finance, finance])).toThrow(
    'Duplicate document source',
  );
});
it.each([
  { ...finance, id: '__proto__' },
  { ...finance, label: '' },
])('rejects invalid source metadata', (adapter) => {
  expect(() => new DocumentAdapterFactory([adapter])).toThrow(
    'Invalid document source',
  );
});
