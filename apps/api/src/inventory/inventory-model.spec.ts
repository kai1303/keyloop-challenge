import { describe, expect, it } from 'vitest';
import { dealerDate, daysInStock, validateAction } from './inventory-model.js';

it('uses dealership midnight even when UTC is still the previous date', () => {
  expect(dealerDate(new Date('2030-01-02T17:01:00Z'))).toBe('2030-01-03');
  expect(daysInStock('2029-10-04', '2030-01-02')).toBe(90);
  expect(daysInStock('2029-10-04', '2030-01-03')).toBe(91);
});
describe('action payload boundary', () => {
  it('normalizes an optional note', () => {
    expect(
      validateAction({
        action: 'Monitor Stock',
        note: '  weekly review  ',
        expectedVersion: 0,
      }),
    ).toEqual({
      action: 'Monitor Stock',
      note: 'weekly review',
      expectedVersion: 0,
    });
  });
  it.each([
    null,
    [],
    {},
    { action: 'other', expectedVersion: 0 },
    { action: 'Monitor Stock', expectedVersion: -1 },
    { action: 'Monitor Stock', expectedVersion: 0.5 },
    { action: 'Monitor Stock', expectedVersion: 2147483647 },
    { action: 'Monitor Stock', expectedVersion: 0, note: 7 },
    { action: 'Monitor Stock', expectedVersion: 0, note: 'x'.repeat(1001) },
    { action: 'Monitor Stock', expectedVersion: 0, pricePence: 0 },
  ])('rejects malformed input %#', (value) =>
    expect(() => validateAction(value)).toThrow(),
  );
});
