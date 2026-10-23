import { expect, it } from 'vitest';
import {
  parseInventoryQuery,
  encodeInventoryCursor,
  decodeInventoryCursor,
} from './inventory-query.js';
it('combines filters with ordered multi-sort and bounded defaults', () => {
  expect(
    parseInventoryQuery({
      make: ['Ford', 'Toyota'],
      age: 'aging',
      sort: 'daysInStock:desc,pricePence:asc',
    }),
  ).toMatchObject({
    make: ['Ford', 'Toyota'],
    age: 'aging',
    limit: 25,
    sort: [
      { key: 'daysInStock', direction: 'desc' },
      { key: 'pricePence', direction: 'asc' },
    ],
  });
});
it.each([
  { limit: '101' },
  { sort: 'note:asc' },
  { sort: 'pricePence:asc,pricePence:desc' },
  { age: '90' },
  { make: { eq: 'Ford' } },
  { after: 'invalid' },
  { unknown: 'x' },
])('rejects invalid query input', (input) => {
  expect(() => {
    const query = parseInventoryQuery(input);
    decodeInventoryCursor(query);
  }).toThrow();
});
it('binds opaque cursors to the active filters, sort and page size', () => {
  const query = parseInventoryQuery({ sort: 'pricePence:asc' });
  const cursor = encodeInventoryCursor(query, [
    123,
    '00000000-0000-4000-8000-000000000001',
  ]);
  expect(decodeInventoryCursor({ ...query, after: cursor })).toEqual([
    123,
    '00000000-0000-4000-8000-000000000001',
  ]);
  expect(() =>
    decodeInventoryCursor({ ...query, limit: 10, after: cursor }),
  ).toThrow();
  expect(() =>
    decodeInventoryCursor({
      ...query,
      after: encodeInventoryCursor(query, ['bad', 'invalid']),
    }),
  ).toThrow();
});
