import type { DocumentSourceAdapter } from '../document-source.adapter.js';
import { documentRecord, normalizeDocuments } from '../document-normalizer.js';

export class ServiceDocumentAdapter implements DocumentSourceAdapter {
  readonly id = 'service';
  readonly label = 'Service System';
  path(vin: string | null): string {
    return vin === null ? '/documents' : `/vehicles/${vin}/documents`;
  }
  normalize(body: unknown, vin: string | null) {
    const payload = documentRecord(body);
    return normalizeDocuments(
      this.id,
      vin,
      payload.vehicleVin,
      payload.records,
      (row) => ({
        id: row.reference,
        vin: row.vehicleVin,
        title: row.description,
        type: row.category,
        issuedAt: row.date,
        content: row.content,
      }),
    );
  }
}
