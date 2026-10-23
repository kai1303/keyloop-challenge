import { StaffAuthModule } from './auth/staff-auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BookingsModule } from './bookings/bookings.module.js';

@Module({
  imports: [
    StaffAuthModule,
    InventoryModule,
    LeadsModule,
    DocumentsModule,
    BookingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
