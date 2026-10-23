import { Inject, Injectable } from '@nestjs/common';
import type { DocumentSourceAdapter } from './document-source.adapter.js';

export const DOCUMENT_ADAPTERS = 'DOCUMENT_ADAPTERS';

@Injectable()
export class DocumentAdapterFactory {
  private readonly registry = new Map<string, DocumentSourceAdapter>();
  constructor(
    @Inject(DOCUMENT_ADAPTERS) adapters: readonly DocumentSourceAdapter[],
  ) {
    for (const adapter of adapters) {
      if (
        !/^[a-z][a-z0-9-]{0,31}$/.test(adapter.id) ||
        !adapter.label.trim() ||
        adapter.label.length > 80
      )
        throw new Error('Invalid document source metadata');
      if (this.registry.has(adapter.id))
        throw new Error('Duplicate document source: ' + adapter.id);
      this.registry.set(adapter.id, adapter);
    }
  }
  create(id: string): DocumentSourceAdapter {
    const adapter = this.registry.get(id);
    if (!adapter) throw new Error('Unknown document source: ' + id);
    return adapter;
  }
}
