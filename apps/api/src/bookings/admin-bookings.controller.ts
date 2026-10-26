import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { Roles } from '../auth/staff-auth.guard.js';
import type { Response } from 'express';
import {
  AdminBookingsQuery,
  AdminCreateBookingDto,
  ChangeBookingStatusDto,
  RescheduleBookingDto,
} from './admin-bookings.dto.js';

@Controller('admin/bookings')
@Roles('admin', 'technician')
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('catalog')
  catalog() {
    return this.bookings.adminCatalog();
  }

  @Get()
  list(@Query() query: AdminBookingsQuery) {
    return this.bookings.listBookings(query.date);
  }

  @Post()
  async create(
    @Body() input: AdminCreateBookingDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const booking = await this.bookings.createAdmin(input);
    response.location('/admin/bookings/' + booking.id);
    return booking;
  }

  @Get(':id')
  find(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.bookings.findBooking(id);
  }

  @Patch(':id')
  reschedule(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: RescheduleBookingDto,
  ) {
    return this.bookings.reschedule(id, input);
  }

  @Patch(':id/status')
  status(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ChangeBookingStatusDto,
  ) {
    return this.bookings.changeStatus(id, input);
  }
}
