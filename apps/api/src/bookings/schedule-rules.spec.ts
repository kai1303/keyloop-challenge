import { ScheduleRules, readSchedule } from './schedule-rules.js';

const weekdays = Array.from({ length: 7 }, () => ({
  open: '09:00',
  close: '17:00',
}));
const now = new Date('2030-01-01T00:00:00Z');
const rules = new ScheduleRules({ timeZone: 'UTC', hours: weekdays });

describe('ScheduleRules', () => {
  it('calculates the service end and dealership date', () => {
    expect(rules.interval('2030-01-02T10:00:00Z', 60, now)).toEqual({
      startsAt: new Date('2030-01-02T10:00:00Z'),
      endsAt: new Date('2030-01-02T11:00:00Z'),
      date: '2030-01-02',
    });
  });

  it('accepts ending exactly at closing time', () => {
    expect(
      rules.interval('2030-01-02T16:00:00Z', 60, now).endsAt.toISOString(),
    ).toBe('2030-01-02T17:00:00.000Z');
  });

  it.each([
    ['2030-01-02T08:59:00Z', 30],
    ['2030-01-02T16:30:00Z', 60],
    ['2029-12-31T10:00:00Z', 30],
    ['2030-01-02T10:00:00', 30],
    ['invalid', 30],
    ['2030-01-02T10:00:00Z', 0],
  ])('rejects invalid interval %s / %s minutes', (start, duration) => {
    expect(() =>
      rules.interval(start as string, duration as number, now),
    ).toThrow();
  });

  it('rejects a closed day', () => {
    const closed = new ScheduleRules({
      timeZone: 'UTC',
      hours: Array(7).fill(null),
    });
    expect(() => closed.interval('2030-01-02T10:00:00Z', 60, now)).toThrow();
  });

  it('evaluates local hours across daylight-saving changes', () => {
    const ny = new ScheduleRules({
      timeZone: 'America/New_York',
      hours: weekdays,
    });
    expect(ny.interval('2030-03-11T13:00:00Z', 60, now).date).toBe(
      '2030-03-11',
    );
    expect(ny.interval('2030-01-02T14:00:00Z', 60, now).date).toBe(
      '2030-01-02',
    );
    expect(() => ny.interval('2030-03-11T12:00:00Z', 60, now)).toThrow();
  });

  it('fails startup configuration for missing or invalid hours/timezone', () => {
    expect(() => readSchedule({})).toThrow();
    expect(() =>
      readSchedule({
        DEALERSHIP_TIMEZONE: 'Not/AZone',
        DEALERSHIP_OPENING_HOURS: JSON.stringify(weekdays),
      }),
    ).toThrow();
    expect(() =>
      readSchedule({
        DEALERSHIP_TIMEZONE: 'UTC',
        DEALERSHIP_OPENING_HOURS: JSON.stringify([
          { open: '17:00', close: '09:00' },
        ]),
      }),
    ).toThrow();
  });
});

it.each([
  '2030-01-02T10:15:00Z',
  '2030-01-02T10:00:01Z',
  '2030-01-02T10:00:00.001Z',
])('rejects starts outside whole-hour slots: %s', (input) => {
  expect(() => rules.interval(input, 60, now)).toThrow(/hour/i);
});
it('requires all services to last exactly one hour', () => {
  expect(() => rules.interval('2030-01-02T10:00:00Z', 30, now)).toThrow(/60/);
});
it('generates only full whole-hour slots inside opening hours', () => {
  const partial = new ScheduleRules({
    timeZone: 'UTC',
    hours: Array(7).fill({ open: '09:10', close: '12:10' }),
  });
  expect(
    partial.daySlots('2030-01-02').map((start) => start.toISOString()),
  ).toEqual(['2030-01-02T10:00:00.000Z', '2030-01-02T11:00:00.000Z']);
});
it('keeps whole local hours across a half-hour daylight-saving transition', () => {
  const lordHowe = new ScheduleRules({
    timeZone: 'Australia/Lord_Howe',
    hours: Array(7).fill({ open: '00:00', close: '05:00' }),
  });
  expect(
    lordHowe
      .daySlots('2030-10-06')
      .map((start) =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Australia/Lord_Howe',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(start),
      ),
  ).toEqual(['00:00', '01:00', '03:00', '04:00']);
});
it('rejects a second occurrence of an ambiguous local hour outside the canonical slot grid', () => {
  const ny = new ScheduleRules({
    timeZone: 'America/New_York',
    hours: Array(7).fill({ open: '00:00', close: '05:00' }),
  });
  const slots = ny.daySlots('2030-11-03');
  const repeated = ['2030-11-03T01:00:00-04:00', '2030-11-03T01:00:00-05:00'];
  const excluded = repeated.find(
    (input) => !slots.some((start) => start.getTime() === Date.parse(input)),
  )!;
  expect(() => ny.interval(excluded, 60, now)).toThrow(/hourly slot/i);
});
