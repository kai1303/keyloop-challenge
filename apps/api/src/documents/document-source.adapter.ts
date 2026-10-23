import type { VehicleDocument } from './document-model.js';

export interface DocumentSourceAdapter {
  readonly id: string;
  readonly label: string;
  path(vin: string | null): string;
  normalize(body: unknown, vin: string | null): VehicleDocument[];
}
