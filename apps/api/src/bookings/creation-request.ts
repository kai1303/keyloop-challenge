import { BadRequestException } from '@nestjs/common';

export interface CreationRequest {
  key: string;
  scope: string;
}

export function creationRequest(key: unknown, scope: string): CreationRequest {
  if (
    typeof key !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    throw new BadRequestException('Idempotency-Key must be a UUID v4');
  return { key, scope };
}
