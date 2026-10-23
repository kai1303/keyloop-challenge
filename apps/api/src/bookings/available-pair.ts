import type { EntityManager } from 'typeorm';
import type { ScheduleRules } from './schedule-rules.js';
import type {
  AvailabilitySlot,
  Interval,
  ResourcePair,
  ResourceAvailability,
} from './booking.types.js';

const freeResources = `/* free-resources */
WITH slots AS (
  SELECT start AS starts_at, start + $3 * interval '1 minute' AS ends_at
  FROM unnest($2::timestamptz[]) AS start
), free_technicians AS (
  SELECT s.starts_at, t.id, t.name
  FROM slots s CROSS JOIN public.users t
  JOIN public.technician_service_types q ON q.technician_id=t.id
  WHERE q.service_type_id=$1 AND t.role='technician' AND COALESCE(t.banned,false)=false
    AND ($5::text IS NULL OR t.id=$5)
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bookings b
      WHERE b.technician_id=t.id AND b.status <> 'CANCELLED'
        AND b.starts_at < s.ends_at AND b.ends_at > s.starts_at
        AND ($4::uuid IS NULL OR b.id <> $4)
    )
), free_bays AS (
  SELECT s.starts_at, bay.id, bay.name
  FROM slots s CROSS JOIN public.service_bays bay
  WHERE ($6::uuid IS NULL OR bay.id=$6)
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bookings b
      WHERE b.service_bay_id=bay.id AND b.status <> 'CANCELLED'
        AND b.starts_at < s.ends_at AND b.ends_at > s.starts_at
        AND ($4::uuid IS NULL OR b.id <> $4)
    )
)`;

export async function availableResources(
  manager: EntityManager,
  serviceTypeId: string,
  interval: Interval,
  selected?: Partial<ResourcePair>,
  excludeBookingId?: string,
): Promise<ResourceAvailability> {
  const [resources] = await manager.query<ResourceAvailability[]>(
    freeResources +
      ` SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) FROM free_technicians), '[]'::jsonb) AS technicians,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) FROM free_bays), '[]'::jsonb) AS bays`,
    [
      serviceTypeId,
      [interval.startsAt],
      (interval.endsAt.getTime() - interval.startsAt.getTime()) / 60_000,
      excludeBookingId ?? null,
      selected?.technicianId ?? null,
      selected?.bayId ?? null,
    ],
  );
  return resources;
}

export async function availablePair(
  manager: EntityManager,
  serviceTypeId: string,
  interval: Interval,
  selected?: Partial<ResourcePair>,
  excludeBookingId?: string,
): Promise<ResourcePair | null> {
  const { technicians, bays } = await availableResources(
    manager,
    serviceTypeId,
    interval,
    selected,
    excludeBookingId,
  );
  return technicians.length && bays.length
    ? { technicianId: technicians[0].id, bayId: bays[0].id }
    : null;
}

export async function availableSlots(
  manager: EntityManager,
  serviceTypeId: string,
  date: string,
  rules: ScheduleRules,
): Promise<AvailabilitySlot[]> {
  const now = Date.now();
  const starts = rules.daySlots(date).filter((start) => start.getTime() > now);
  if (!starts.length) return [];
  const rows = await manager.query<
    { startsAt: Date; endsAt: Date; available: boolean }[]
  >(
    freeResources +
      ` SELECT s.starts_at AS "startsAt", s.ends_at AS "endsAt",
      EXISTS (SELECT 1 FROM free_technicians t WHERE t.starts_at=s.starts_at)
      AND EXISTS (SELECT 1 FROM free_bays b WHERE b.starts_at=s.starts_at) AS available
      FROM slots s ORDER BY s.starts_at`,
    [serviceTypeId, starts, 60, null, null, null],
  );
  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }));
}
