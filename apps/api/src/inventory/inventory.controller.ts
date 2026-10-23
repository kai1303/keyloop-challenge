import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.inventory.list(query);
  }
  @Get('metadata')
  metadata() {
    return this.inventory.metadata();
  }
  @Get(':id')
  find(@Param('id') id: string) {
    return this.inventory.find(id);
  }
  @Patch(':id/action')
  save(@Param('id') id: string, @Body() body: unknown) {
    return this.inventory.save(id, body);
  }
}
