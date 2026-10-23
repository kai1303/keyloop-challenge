import { BadRequestException } from '@nestjs/common';

export type DocumentSource = string;
export interface VehicleDocument {
  id: string;
  vin: string;
  title: string;
  type: string;
  issuedAt: string;
  source: DocumentSource;
  content: string;
}
export interface DocumentSearchResult {
  vin: string | null;
  documents: VehicleDocument[];
  sources: Record<
    DocumentSource,
    { label: string; status: 'ok' | 'unavailable'; count: number }
  >;
}
export function normalizeVin(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-HJ-NPR-Z0-9]{17}$/.test(value.trim().toUpperCase())
  )
    throw new BadRequestException(
      'Enter a 17-character VIN using letters and numbers, excluding I, O and Q.',
    );
  return value.trim().toUpperCase();
}
