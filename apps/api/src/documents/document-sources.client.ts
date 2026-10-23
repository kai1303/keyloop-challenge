import { Inject, Injectable } from '@nestjs/common';
import { DocumentAdapterFactory } from './document-adapter.factory.js';
import type { DocumentSource, VehicleDocument } from './document-model.js';

export const DOCUMENT_SOURCES = 'DOCUMENT_SOURCES';
export interface DocumentSources {
  urls: Record<string, string>;
  timeoutMs: number;
}
export function createDocumentSources(
  env: Record<string, string | undefined> = process.env,
): DocumentSources {
  const origin = `http://127.0.0.1:${env.PORT ?? '3000'}`;
  const sources = {
    urls: {
      sales: env.DOCUMENT_SALES_API_URL ?? origin + '/mock/sales',
      service: env.DOCUMENT_SERVICE_API_URL ?? origin + '/mock/service',
    },
    timeoutMs: 3000,
  };
  for (const address of Object.values(sources.urls)) validateMockUrl(address);
  return sources;
}
function validateMockUrl(address: string): void {
  const url = new URL(address);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Document systems must use loopback mock URLs.');
}
@Injectable()
export class DocumentSourcesClient {
  constructor(
    @Inject(DOCUMENT_SOURCES) private readonly sources: DocumentSources,
    @Inject(DocumentAdapterFactory)
    private readonly adapters: DocumentAdapterFactory,
  ) {
    this.list();
  }
  list(): { id: string; label: string }[] {
    const ids = Object.keys(this.sources.urls);
    if (!ids.length || ids.length > 20)
      throw new Error('Configure between 1 and 20 document sources');
    return ids.map((id) => ({ id, label: this.adapters.create(id).label }));
  }
  async load(
    source: DocumentSource,
    vin: string | null,
    authorization?: string,
  ): Promise<VehicleDocument[]> {
    const adapter = this.adapters.create(source);
    if (!Object.hasOwn(this.sources.urls, source))
      throw new Error('Document source is not configured');
    const baseUrl = this.sources.urls[source]!;
    validateMockUrl(baseUrl);
    const path = adapter.path(vin);
    if (!path.startsWith('/') || path.startsWith('//'))
      throw new Error('Document path must be relative');
    const response = await fetch(baseUrl.replace(/\/$/, '') + path, {
      headers: {
        Accept: 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      signal: AbortSignal.timeout(this.sources.timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Document system unavailable');
    return adapter.normalize(await response.json(), vin);
  }
}
