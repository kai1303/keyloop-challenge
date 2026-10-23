import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBookingDto } from './bookings.dto.js';

it('normalizes a guest request and rejects an incomplete email', async () => {
  const input = {
    name: ' Guest ',
    email: ' Guest@Example.com ',
    phoneNumber: '+84901234567',
    registrationNumber: ' ab-123 ',
    serviceTypeId: '00000000-0000-4000-8000-000000000001',
    startsAt: '2030-01-02T10:00:00Z',
  };
  const dto = plainToInstance(CreateBookingDto, input);
  expect(await validate(dto)).toHaveLength(0);
  expect(dto.email).toBe('guest@example.com');
  expect(dto.registrationNumber).toBe('AB-123');
  expect(
    await validate(
      plainToInstance(CreateBookingDto, { ...input, email: 'guest@' }),
    ),
  ).not.toHaveLength(0);
});
