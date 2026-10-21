import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}
  @Get()
  list() {
    return this.inventory.list();
  }
  @Patch(':id/action')
  save(@Param('id') id: string, @Body() body: unknown) {
    return this.inventory.save(id, body);
  }
}
