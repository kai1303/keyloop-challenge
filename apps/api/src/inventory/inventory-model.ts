import { BadRequestException } from '@nestjs/common';

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const ACTIONS = [
  'Price Reduction Planned',
  'Marketing Push Planned',
  'Wholesale Review Planned',
  'Monitor Stock',
] as const;
export type Action = (typeof ACTIONS)[number];
export interface VehicleRow {
  id: string;
  registration: string;
  make: string;
  model: string;
  model_year: number;
  price_pence: number;
  stocked_on: string;
  current_action: Action | null;
  note: string | null;
  action_updated_at: string | null;
  version: number;
}
export function dealerDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}
export function daysInStock(stockedOn: string, today: string): number {
  return (
    (Date.parse(today + 'T00:00:00Z') - Date.parse(stockedOn + 'T00:00:00Z')) /
    86400000
  );
}
export function vehicleView(row: VehicleRow, today: string) {
  const days = daysInStock(row.stocked_on, today);
  return {
    id: row.id,
    registration: row.registration,
    make: row.make,
    model: row.model,
    modelYear: row.model_year,
    pricePence: row.price_pence,
    stockedOn: row.stocked_on,
    currentAction: row.current_action,
    note: row.note,
    actionUpdatedAt: row.action_updated_at,
    version: row.version,
    daysInStock: days,
    aging: days > 90,
  };
}
export function validateId(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new BadRequestException('Invalid vehicle ID');
  }
}
export function validateAction(value: unknown): {
  action: Action;
  note: string | null;
  expectedVersion: number;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid action payload');
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !['action', 'note', 'expectedVersion'].includes(key),
    ) ||
    !ACTIONS.includes(body.action as Action) ||
    typeof body.expectedVersion !== 'number' ||
    !Number.isInteger(body.expectedVersion) ||
    body.expectedVersion < 0 ||
    body.expectedVersion > 2147483646 ||
    (body.note !== undefined &&
      body.note !== null &&
      typeof body.note !== 'string')
  ) {
    throw new BadRequestException('Choose a valid action and version');
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000)
    throw new BadRequestException('Notes must be 1,000 characters or fewer');
  return {
    action: body.action as Action,
    note: note || null,
    expectedVersion: body.expectedVersion,
  };
}
