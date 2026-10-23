import {
  normalizeVin,
  type DocumentSource,
  type VehicleDocument,
} from './document-model.js';

export function documentRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid document record');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('Invalid document field');
  return value;
}
function date(value: unknown): string {
  const candidate = text(value, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(candidate) ||
    !Number.isFinite(Date.parse(candidate + 'T00:00:00Z')) ||
    new Date(candidate + 'T00:00:00Z').toISOString().slice(0, 10) !== candidate
  )
    throw new Error('Invalid document date');
  return candidate;
}
export interface DocumentFields {
  id: unknown;
  vin: unknown;
  title: unknown;
  type: unknown;
  issuedAt: unknown;
  content: unknown;
}
export function normalizeDocuments(
  source: DocumentSource,
  vin: string | null,
  envelopeVin: unknown,
  rows: unknown,
  mapRow: (row: Record<string, unknown>) => DocumentFields,
): VehicleDocument[] {
  if (envelopeVin !== vin) throw new Error('Document VIN mismatch');
  if (!Array.isArray(rows) || rows.length > 100)
    throw new Error('Invalid document list');
  const seen = new Set<string>();
  return rows.map((row: unknown) => {
    const fields = mapRow(documentRecord(row));
    const documentVin = normalizeVin(fields.vin ?? vin);
    if (vin !== null && documentVin !== vin)
      throw new Error('Document VIN mismatch');
    const id = source + ':' + text(fields.id, 128);
    if (seen.has(id)) throw new Error('Duplicate source document');
    seen.add(id);
    return {
      id,
      vin: documentVin,
      source,
      title: text(fields.title, 240),
      type: text(fields.type, 80),
      issuedAt: date(fields.issuedAt),
      content: text(fields.content, 20000),
    };
  });
}
