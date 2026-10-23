import { Controller, Get, Inject, Query, Headers } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
@Controller('documents')
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}
  @Get()
  search(
    @Query('vin') vin: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    return this.documents.search(vin, authorization);
  }
}
