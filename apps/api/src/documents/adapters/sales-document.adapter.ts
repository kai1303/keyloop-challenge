import type { DocumentSourceAdapter } from '../document-source.adapter.js';
import { documentRecord, normalizeDocuments } from '../document-normalizer.js';

export class SalesDocumentAdapter implements DocumentSourceAdapter {
  readonly id = 'sales';
  readonly label = 'Sales System';
  path(vin: string | null): string {
    return vin === null ? '/documents' : `/vehicles/${vin}/documents`;
  }
  normalize(body: unknown, vin: string | null) {
    const payload = documentRecord(body);
    return normalizeDocuments(
      this.id,
      vin,
      payload.vin,
      payload.documents,
      (row) => ({
        id: row.document_id,
        vin: row.vin,
        title: row.title,
        type: row.document_type,
        issuedAt: row.issued_at,
        content: row.body,
      }),
    );
  }
}
