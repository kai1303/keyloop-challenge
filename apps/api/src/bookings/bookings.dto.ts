import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

function trim({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CalendarBookingsQuery {
  @Matches(/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/)
  month!: string;
}

export class AvailabilitySlotsQuery {
  @IsUUID('4')
  serviceTypeId!: string;

  @IsISO8601({ strict: true })
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  date!: string;
}

export class AvailabilityQuery {
  @IsUUID('4')
  serviceTypeId!: string;

  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  startsAt!: string;
}

export class CreateBookingDto extends AvailabilityQuery {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(30)
  @Matches(/^\+?[0-9][0-9 ()-]{5,28}[0-9]$/)
  phoneNumber!: string;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  registrationNumber!: string;
}

export class GuestCreateBookingDto extends CreateBookingDto {
  @IsString()
  @Matches(/^(?!auto$)[A-Za-z0-9_-]{1,128}$/)
  technicianId!: string;

  @IsUUID('4')
  serviceBayId!: string;
}
