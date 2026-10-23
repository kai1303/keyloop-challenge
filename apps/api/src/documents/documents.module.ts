import {
  DocumentAdapterFactory,
  DOCUMENT_ADAPTERS,
} from './document-adapter.factory.js';
import { SalesDocumentAdapter } from './adapters/sales-document.adapter.js';
import { ServiceDocumentAdapter } from './adapters/service-document.adapter.js';
import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import {
  DocumentSourcesClient,
  DOCUMENT_SOURCES,
  createDocumentSources,
} from './document-sources.client.js';
import {
  MockSalesController,
  MockServiceController,
} from './mock-documents.js';
@Module({
  controllers: [
    DocumentsController,
    MockSalesController,
    MockServiceController,
  ],
  providers: [
    {
      provide: DOCUMENT_ADAPTERS,
      useFactory: () => [
        new SalesDocumentAdapter(),
        new ServiceDocumentAdapter(),
      ],
    },
    DocumentAdapterFactory,
    { provide: DOCUMENT_SOURCES, useFactory: () => createDocumentSources() },
    DocumentSourcesClient,
    DocumentsService,
  ],
})
export class DocumentsModule {}
