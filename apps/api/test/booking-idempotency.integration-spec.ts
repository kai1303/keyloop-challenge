import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { seedCatalog } from '../src/database/seed.js';
import { testDatabase } from './database-fixture.js';

describe('durable booking creation retries', () => {
  const db = testDatabase();
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array(7).fill({ open: '09:00', close: '17:00' }),
  });
  const service = new BookingsService(db, rules);
  const input = {
    name: 'Retry Guest',
    email: 'retry@example.test',
    phoneNumber: '+84901234567',
    registrationNumber: 'RETRY',
    serviceTypeId: '00000000-0000-4000-8000-000000000001',
    startsAt: '2030-01-02T10:00:00Z',
  };
  beforeAll(async () => {
    await db.initialize();
    await db.runMigrations();
  });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE public.session, public.account, public.booking_requests, public.service_bookings, public.booking_vehicles, public.users, public.technician_service_types, public.service_bays, public.service_types',
    );
    await db.transaction(seedCatalog);
  });
  afterAll(async () => {
    if (db.isInitialized) await db.destroy();
  });

  it('concurrent identical requests commit one booking and replay the confirmation', async () => {
    const attempt = { key: randomUUID(), scope: 'guest' };
    const results = await Promise.all([
      service.create(input, undefined, attempt),
      service.create(input, undefined, attempt),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await db.query('SELECT id FROM public.service_bookings'),
    ).toHaveLength(1);
    expect(await db.query('SELECT id FROM public.users WHERE role=\'customer\'')).toHaveLength(1);
  });

  it('replays after service recreation without checking now-occupied capacity', async () => {
    const attempt = { key: randomUUID(), scope: 'guest' };
    const first = await service.create(input, undefined, attempt);
    const restarted = new BookingsService(db, rules);
    expect(await restarted.create(input, undefined, attempt)).toEqual(first);
  });

  it('rejects a reused key with changed data and retains the original result', async () => {
    const attempt = { key: randomUUID(), scope: 'guest' };
    const first = await service.create(input, undefined, attempt);
    await expect(
      service.create({ ...input, name: 'Changed' }, undefined, attempt),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await service.create(input, undefined, attempt)).toEqual(first);
  });

  it('rolls back the request claim on failed allocation so the key can be retried', async () => {
    const attempt = { key: randomUUID(), scope: 'guest' };
    const occupied = await service.createAdmin(input);
    await expect(
      service.create(input, undefined, attempt),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await db.query('SELECT * FROM public.booking_requests'),
    ).toHaveLength(0);
    await service.changeStatus(occupied.id, {
      status: 'CANCELLED',
      expectedVersion: 1,
    });
    await expect(
      service.create(input, undefined, attempt),
    ).resolves.toHaveProperty('id');
  });

  it('replays an explicitly selected pair and rejects changing a resource under the same key', async () => {
    const attempt = { key: randomUUID(), scope: 'guest' };
    const selected = { technicianId: '00000000-0000-4000-8000-000000000011', bayId: '00000000-0000-4000-8000-000000000021' };
    const first = await service.create(input, selected, attempt);
    expect(await service.create(input, selected, attempt)).toEqual(first);
    await expect(service.create(input, { ...selected, bayId: '00000000-0000-4000-8000-000000000022' }, attempt)).rejects.toBeInstanceOf(ConflictException);
    expect(await db.query('SELECT id FROM public.service_bookings')).toHaveLength(1);
  });

  it('scopes keys to each staff user and separates guest creation', async () => {
    const key = randomUUID();
    const first = await service.createAdmin(input, { key, scope: 'staff:one' });
    const next = { ...input, startsAt: '2030-01-02T11:00:00Z' };
    const second = await service.createAdmin(next, { key, scope: 'staff:two' });
    expect(first.id).not.toBe(second.id);
    const guest = await service.create(
      { ...input, startsAt: '2030-01-02T12:00:00Z' },
      undefined,
      { key, scope: 'guest' },
    );
    expect(guest.id).not.toBe(first.id);
    expect(await service.findBooking(first.id)).toMatchObject({
      id: first.id,
      name: input.name,
    });
  });
  it('replays the original staff response after the booking has changed', async () => {
    const attempt = { key: randomUUID(), scope: 'staff:one' };
    const first = await service.createAdmin(input, attempt);
    await service.changeStatus(first.id, {
      status: 'CANCELLED',
      expectedVersion: 1,
    });
    expect(await service.createAdmin(input, attempt)).toEqual(first);
    expect(await service.findBooking(first.id)).toMatchObject({
      status: 'CANCELLED',
      version: 2,
    });
  });
});
