import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { normalizeVin, type DocumentSearchResult } from './document-model.js';
import { DocumentSourcesClient } from './document-sources.client.js';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DocumentSourcesClient)
    private readonly sources: Pick<DocumentSourcesClient, 'list' | 'load'>,
  ) {}
  async search(
    input: unknown,
    authorization?: string,
  ): Promise<DocumentSearchResult> {
    const vin =
      input === undefined || (typeof input === 'string' && !input.trim())
        ? null
        : normalizeVin(input);
    const systems = this.sources.list();
    const results = await Promise.allSettled(
      systems.map((system) => this.sources.load(system.id, vin, authorization)),
    );
    if (results.every((result) => result.status === 'rejected'))
      throw new BadGatewayException(
        'All document systems are unavailable. Please try again.',
      );
    const documents = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .sort(
        (a, b) =>
          b.issuedAt.localeCompare(a.issuedAt) || a.id.localeCompare(b.id),
      );
    return {
      vin,
      documents,
      sources: Object.fromEntries(
        systems.map((system, index) => {
          const result = results[index]!;
          return [
            system.id,
            {
              label: system.label,
              status: result.status === 'fulfilled' ? 'ok' : 'unavailable',
              count: result.status === 'fulfilled' ? result.value.length : 0,
            },
          ];
        }),
      ),
    };
  }
}
