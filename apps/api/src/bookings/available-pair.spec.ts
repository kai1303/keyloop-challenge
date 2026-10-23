import type { EntityManager } from 'typeorm';
import { availablePair, availableSlots } from './available-pair.js';
import { ScheduleRules } from './schedule-rules.js';
const interval = {
  startsAt: new Date('2030-01-02T10:00:00Z'),
  endsAt: new Date('2030-01-02T11:00:00Z'),
  date: '2030-01-02',
};
it('queries the exact pair and excludes the rescheduled booking in one statement', async () => {
  const query = vi
    .fn()
    .mockResolvedValue([
      {
        technicians: [{ id: 'tech', name: 'Technician' }],
        bays: [{ id: 'bay', name: 'Bay' }],
      },
    ]);
  expect(
    await availablePair(
      { query } as unknown as EntityManager,
      'service',
      interval,
      { technicianId: 'tech', bayId: 'bay' },
      'booking',
    ),
  ).toEqual({ technicianId: 'tech', bayId: 'bay' });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][1]).toEqual([
    'service',
    [interval.startsAt],
    60,
    'booking',
    'tech',
    'bay',
  ]);
});
it('uses one query for all future starts and no query for a closed day', async () => {
  const query = vi
    .fn()
    .mockResolvedValue([
      { startsAt: interval.startsAt, endsAt: interval.endsAt, available: true },
    ]);
  const manager = { query } as unknown as EntityManager;
  const rules = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array(7).fill({ open: '09:00', close: '17:00' }),
  });
  expect(
    await availableSlots(manager, 'service', interval.date, rules),
  ).toEqual([
    {
      startsAt: interval.startsAt.toISOString(),
      endsAt: interval.endsAt.toISOString(),
      available: true,
    },
  ]);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][1][1]).toHaveLength(8);
  expect(
    await availableSlots(
      manager,
      'service',
      interval.date,
      new ScheduleRules({ timeZone: 'UTC', hours: Array(7).fill(null) }),
    ),
  ).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
});
