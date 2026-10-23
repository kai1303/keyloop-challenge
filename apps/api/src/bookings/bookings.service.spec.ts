import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { BookingsService } from './bookings.service.js';
import { ScheduleRules } from './schedule-rules.js';
import type { ResourcePair } from './booking.types.js';

const pair = { technicianId: 'tech-a', bayId: 'bay-a' };
const alternative = { technicianId: 'tech-b', bayId: 'bay-b' };
const catalog = { id: 'service', name: 'Inspection', durationMinutes: 60 };
const input = {
  name: ' Guest ', email: ' Guest@Example.com ', phoneNumber: '+84901234567',
  registrationNumber: ' ab-123 ', serviceTypeId: catalog.id,
  startsAt: '2030-01-02T10:00:00Z',
};

function fixture(answers: (ResourcePair | null)[] = [pair, pair]) {
  let answer: ResourcePair | null = null;
  const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<unknown[]> => {
    if (sql.includes('set_config')) return [];
    if (sql.includes('FROM public.service_types')) return [catalog];
    if (sql.includes('/* free-resources */')) {
      if (!answers.length) throw new Error('Unexpected availability query');
      answer = answers.shift()!;
      return [{ technicians: answer ? [{ id: answer.technicianId, name: 'Technician' }] : [],
        bays: answer ? [{ id: answer.bayId, name: 'Bay' }] : [] }];
    }
    if (sql.includes('FOR UPDATE')) return (values[0] as string[]).map(id => ({ id }));
    if (sql.startsWith('INSERT INTO public.users')) return [];
    if (sql.startsWith('SELECT id FROM public.users')) return [{ id: 'customer' }];
    if (sql.startsWith('INSERT INTO public.booking_vehicles')) return [];
    if (sql.startsWith('SELECT id FROM public.booking_vehicles')) return [{ id: 'vehicle' }];
    if (sql.startsWith('INSERT INTO public.service_bookings')) {
      return [{
        id: 'booking', status: 'CONFIRMED', startsAt: values[5], endsAt: values[6],
      }];
    }
    throw new Error('Unexpected database operation');
  });
  const manager = { query };
  const transaction = vi.fn(async (
    _isolation: string, operation: (value: typeof manager) => Promise<unknown>,
  ) => operation(manager));
  const db = { transaction, manager, query } as unknown as DataSource;
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array.from({ length: 7 }, () => ({ open: '09:00', close: '17:00' })),
  });
  return { service: new BookingsService(db, rules), transaction, query };
}

describe('BookingsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('confirms a booking with normalized email and submitted contact snapshot', async () => {
    const { service, query } = fixture();
    const result = await service.create(input);
    expect(result).toMatchObject({
      id: 'booking', registrationNumber: 'AB-123',
      startsAt: '2030-01-02T10:00:00.000Z', endsAt: '2030-01-02T11:00:00.000Z',
    });
    expect(result).not.toHaveProperty('email');
    const insert = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO public.service_bookings'));
    expect(insert?.[1]?.slice(7, 10)).toEqual(['Guest', 'guest@example.com', '+84901234567']);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE public.users'))).toBe(false);
  });

  it('locks existing resources before rechecking booking availability and writing', async () => {
    const { service, query } = fixture();
    await service.create(input);
    const sql = query.mock.calls.map(([text]) => text);
    expect(sql.some(text => text.includes('resource_slots'))).toBe(false);
    const locks = sql.map((text, index) => text.includes('FOR UPDATE') ? index : -1).filter(index => index >= 0);
    expect(locks).toHaveLength(2);
    expect(sql[locks[0]]).toContain('public.users');
    expect(sql[locks[1]]).toContain('public.service_bays');
    const reads = sql.map((text, index) => text.includes('/* free-resources */') ? index : -1).filter(index => index >= 0);
    expect(reads).toHaveLength(2);
    expect(reads[1]).toBeGreaterThan(locks[1]);
    expect(sql.findIndex(text => text.startsWith('INSERT INTO public.service_bookings'))).toBeGreaterThan(reads[1]);
  });

  it('returns 409 without contact writes when resources are unavailable', async () => {
    const { service, query } = fixture([null]);
    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });

  it('retries a pair lost while waiting and uses a fresh eligible pair', async () => {
    const { service, transaction, query } = fixture([pair, null, alternative, alternative]);
    await service.create(input);
    expect(transaction).toHaveBeenCalledTimes(2);
    const insert = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO public.service_bookings'));
    expect(insert?.[1]?.slice(3, 5)).toEqual(['tech-b', 'bay-b']);
  });

  it.each(['40P01', '55P03'])('retries PostgreSQL contention %s', async code => {
    const { service, transaction } = fixture();
    transaction.mockRejectedValueOnce({ driverError: { code } });
    await expect(service.create(input)).resolves.toHaveProperty('id');
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('returns 503 after three transient failures', async () => {
    const { service, transaction } = fixture();
    transaction.mockRejectedValue({ driverError: { code: '40P01' } });
    await expect(service.create(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('propagates unexpected failures without retrying', async () => {
    const { service, transaction } = fixture();
    const failure = new Error('connection failed');
    transaction.mockRejectedValueOnce(failure);
    await expect(service.create(input)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('returns an availability preview without locks or writes', async () => {
    const { service, query, transaction } = fixture([null]);
    expect(await service.availability(input)).toMatchObject({ available: false });
    expect(transaction).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE') || sql.startsWith('INSERT')))
      .toBe(false);
  });
});
