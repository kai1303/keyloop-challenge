import { BadRequestException } from '@nestjs/common';

type Cursor = { received_at: string; id: string };
export function parseLeadsQuery(input: Record<string, unknown>) {
  const invalid = () => new BadRequestException('Invalid lead limit or cursor');
  const rawLimit = input.limit ?? '50';
  if (
    Object.keys(input).some((key) => !['limit', 'after'].includes(key)) ||
    typeof rawLimit !== 'string' ||
    !/^(?:[1-9]\d?|100)$/.test(rawLimit)
  )
    throw invalid();
  let after: Cursor | null = null;
  if (input.after !== undefined) {
    if (
      typeof input.after !== 'string' ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(input.after)
    )
      throw invalid();
    try {
      const value: unknown = JSON.parse(
        Buffer.from(input.after, 'base64url').toString('utf8'),
      );
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw invalid();
      const cursor = value as Cursor;
      if (
        Object.keys(cursor).sort().join(',') !== 'id,received_at' ||
        typeof cursor.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          cursor.id,
        ) ||
        typeof cursor.received_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
          cursor.received_at,
        ) ||
        !Number.isFinite(Date.parse(cursor.received_at))
      )
        throw invalid();
      after = cursor;
    } catch {
      throw invalid();
    }
  }
  return { limit: Number(rawLimit), after };
}

export function leadCursor(row: Cursor): string {
  return Buffer.from(
    JSON.stringify({ received_at: row.received_at, id: row.id }),
  ).toString('base64url');
}
