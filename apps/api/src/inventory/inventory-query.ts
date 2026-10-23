import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ACTIONS } from './inventory-model.js';
const keys = [
  'vehicle',
  'registration',
  'pricePence',
  'daysInStock',
  'currentAction',
] as const;
export interface InventoryQuery {
  make: string[];
  model: string[];
  age: string;
  action: string;
  sort: { key: (typeof keys)[number]; direction: 'asc' | 'desc' }[];
  limit: number;
  after: string | null;
}
function invalid(): never {
  throw new BadRequestException('Invalid inventory filters, sorting or cursor');
}
function values(value: unknown): string[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (
    list.length > 20 ||
    list.some(
      (item) => typeof item !== 'string' || !item.trim() || item.length > 80,
    )
  )
    return invalid();
  return [...new Set(list as string[])].sort();
}
export function parseInventoryQuery(
  input: Record<string, unknown> = {},
): InventoryQuery {
  if (
    Object.keys(input).some(
      (key) =>
        !['make', 'model', 'age', 'action', 'sort', 'limit', 'after'].includes(
          key,
        ),
    )
  )
    return invalid();
  const age = input.age ?? 'all',
    action = input.action ?? 'all';
  if (
    typeof age !== 'string' ||
    !['all', '0-30', '31-60', '61-90', 'aging'].includes(age) ||
    typeof action !== 'string' ||
    !['all', 'needsAction', ...ACTIONS].includes(action)
  )
    return invalid();
  const limit = input.limit === undefined ? 25 : Number(input.limit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (input.limit !== undefined &&
      typeof input.limit !== 'string' &&
      typeof input.limit !== 'number')
  )
    return invalid();
  if (input.sort !== undefined && typeof input.sort !== 'string')
    return invalid();
  const sort = ((input.sort as string | undefined) ?? 'daysInStock:desc')
    .split(',')
    .map((value) => {
      const [key, direction, ...rest] = value.split(':');
      if (
        rest.length ||
        !keys.includes(key as (typeof keys)[number]) ||
        !['asc', 'desc'].includes(direction ?? '')
      )
        return invalid();
      return {
        key: key as (typeof keys)[number],
        direction: direction as 'asc' | 'desc',
      };
    });
  if (
    sort.length > 3 ||
    new Set(sort.map((item) => item.key)).size !== sort.length
  )
    return invalid();
  if (
    input.after !== undefined &&
    (typeof input.after !== 'string' ||
      !/^[A-Za-z0-9_-]{1,4096}$/.test(input.after))
  )
    return invalid();
  return {
    make: values(input.make),
    model: values(input.model),
    age,
    action,
    sort,
    limit,
    after: (input.after as string) ?? null,
  };
}
function fingerprint(query: InventoryQuery): string {
  const { after: _after, ...settings } = query;
  return createHash('sha256').update(JSON.stringify(settings)).digest('hex');
}
export function encodeInventoryCursor(
  query: InventoryQuery,
  values: unknown[],
): string {
  return Buffer.from(
    JSON.stringify({ v: 1, q: fingerprint(query), values }),
  ).toString('base64url');
}
export function decodeInventoryCursor(query: InventoryQuery): unknown[] | null {
  if (!query.after) return null;
  try {
    const cursor = JSON.parse(
      Buffer.from(query.after, 'base64url').toString('utf8'),
    ) as { v: unknown; q: unknown; values: unknown };
    const types = query.sort
      .flatMap((sort) =>
        sort.key === 'vehicle'
          ? ['text', 'text']
          : [
              sort.key === 'pricePence'
                ? 'number'
                : sort.key === 'daysInStock'
                  ? 'date'
                  : 'text',
            ],
      )
      .concat('id');
    if (
      cursor.v !== 1 ||
      cursor.q !== fingerprint(query) ||
      !Array.isArray(cursor.values) ||
      cursor.values.length !== types.length
    )
      return invalid();
    cursor.values.forEach((value, index) => {
      const type = types[index];
      if (type === 'number') {
        if (
          !Number.isInteger(value) ||
          (value as number) < 0 ||
          (value as number) > 2147483647
        )
          return invalid();
      } else if (
        typeof value !== 'string' ||
        value.length > 160 ||
        (type === 'id' &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
          )) ||
        (type === 'date' &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
            new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !==
              value))
      )
        return invalid();
    });
    return cursor.values;
  } catch {
    return invalid();
  }
}
