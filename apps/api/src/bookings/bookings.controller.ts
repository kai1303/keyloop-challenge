import { Public } from '../auth/staff-auth.guard.js';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BookingsService } from './bookings.service.js';
import {
  AvailabilityQuery,
  AvailabilitySlotsQuery,
  CalendarBookingsQuery,
  GuestCreateBookingDto,
} from './bookings.dto.js';
import { ScheduleRules } from './schedule-rules.js';

@Controller()
@Public()
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly rules: ScheduleRules,
  ) {}

  @Get('schedule')
  schedule() {
    return this.rules.schedule;
  }

  @Get('service-types')
  listServices() {
    return this.bookings.listServices();
  }

  @Get('bookings')
  calendarBookings(@Query() query: CalendarBookingsQuery) {
    return this.bookings.calendarBookings(query.month);
  }

  @Get('availability/slots')
  availabilitySlots(@Query() query: AvailabilitySlotsQuery) {
    return this.bookings.availabilitySlots(query);
  }

  @Get('availability')
  availability(@Query() query: AvailabilityQuery) {
    return this.bookings.availability(query);
  }

  @Post('bookings')
  async create(
    @Body() input: GuestCreateBookingDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const booking = await this.bookings.create(
      input,
      { technicianId: input.technicianId, bayId: input.serviceBayId },
    );
    response.location('/admin/bookings/' + booking.id);
    return booking;
  }
}
