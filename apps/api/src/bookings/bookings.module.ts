import { Module } from '@nestjs/common';
import { Database } from '../database/database.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { readSchedule, ScheduleRules } from './schedule-rules.js';

@Module({
  controllers: [BookingsController, AdminBookingsController],
  providers: [
    Database,
    BookingsService,
    {
      provide: ScheduleRules,
      useFactory: () => new ScheduleRules(readSchedule()),
    },
  ],
})
export class BookingsModule {}
