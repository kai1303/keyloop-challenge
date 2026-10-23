import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CreateBookingDto } from './bookings.dto.js';
import type { BookingStatus } from './booking.types.js';

export class AdminBookingsQuery {
  @IsISO8601({ strict: true })
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  date!: string;
}

export class AdminCreateBookingDto extends CreateBookingDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^(?!auto$)[A-Za-z0-9_-]{1,128}$/)
  technicianId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  serviceBayId?: string;
}

export class RescheduleBookingDto {
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  startsAt!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^(?!auto$)[A-Za-z0-9_-]{1,128}$/)
  technicianId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  serviceBayId?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ChangeBookingStatusDto {
  @IsIn(['CONFIRMED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED'])
  status!: BookingStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
