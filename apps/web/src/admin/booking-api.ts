import { authenticatedFetch } from "../auth/authenticated-fetch";
import { createClient } from "@supabase/supabase-js";
import { DateTime, IANAZone } from "luxon";
import {
  STATUSES,
  type Booking,
  type BookingDraft,
  type BookingStatus,
} from "./booking-model";
import {
  bookingStartIso,
  type BookingCatalog,
  type BookingScheduleConfig,
} from "./booking-config";

async function request(path: string, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(10000);
  const response = await authenticatedFetch(
    "/booking-api/admin/bookings" + path,
    {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(". ")
          : "Unable to complete the booking request. Please retry.",
    );
  return body;
}
function parseBooking(value: unknown): Booking {
  if (!value || typeof value !== "object")
    throw new Error("Invalid booking response");
  const row = value as Record<string, unknown>;
  if (
    ![
      "id",
      "name",
      "email",
      "phoneNumber",
      "registrationNumber",
      "serviceTypeId",
      "date",
      "time",
      "technicianId",
      "serviceBayId",
    ].every((key) => typeof row[key] === "string" && row[key] !== "") ||
    !DateTime.fromISO(String(row.date)).isValid ||
    !/^\d{2}:\d{2}$/.test(String(row.time)) ||
    !Object.hasOwn(STATUSES, String(row.status)) ||
    !Number.isInteger(row.version) ||
    Number(row.version) < 1 ||
    typeof row.durationMinutes !== "number" ||
    row.durationMinutes <= 0
  )
    throw new Error("Invalid booking response");
  return value as Booking;
}
export async function getBookingCatalog(
  signal?: AbortSignal,
): Promise<BookingCatalog> {
  const body = await request("/catalog", { signal });
  if (
    !body ||
    !Array.isArray(body.services) ||
    body.services.length === 0 ||
    !body.services.every(
      (item: Record<string, unknown>) =>
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.durationMinutes === 60,
    ) ||
    !Array.isArray(body.technicians) ||
    !body.technicians.every(
      (item: Record<string, unknown>) =>
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Array.isArray(item.services) &&
        item.services.every((id) => typeof id === "string"),
    ) ||
    !Array.isArray(body.bays) ||
    !body.bays.every(
      (item: Record<string, unknown>) =>
        typeof item.id === "string" && typeof item.name === "string",
    ) ||
    !body.schedule ||
    !IANAZone.isValidZone(body.schedule.timeZone) ||
    !Array.isArray(body.schedule.hours) ||
    body.schedule.hours.length !== 7 ||
    !body.schedule.hours.every(
      (hours: { open: string; close: string } | null) =>
        hours === null ||
        (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours.open) &&
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours.close) &&
          hours.open < hours.close),
    )
  )
    throw new Error("Invalid booking catalog");
  return body;
}
export async function listBookings(
  date: string,
  signal?: AbortSignal,
): Promise<Booking[]> {
  const rows = await request("?" + new URLSearchParams({ date }), { signal });
  if (!Array.isArray(rows)) throw new Error("Invalid booking list");
  return rows.map(parseBooking);
}
function selected(draft: BookingDraft) {
  return {
    ...(draft.technicianId === "auto"
      ? {}
      : { technicianId: draft.technicianId }),
    ...(draft.serviceBayId === "auto"
      ? {}
      : { serviceBayId: draft.serviceBayId }),
  };
}
export async function saveBooking(
  draft: BookingDraft,
  schedule: BookingScheduleConfig,
  previous?: Booking,
): Promise<Booking> {
  const startsAt = bookingStartIso(draft.date, draft.time, schedule);
  const body = previous
    ? { startsAt, ...selected(draft), expectedVersion: previous.version }
    : {
        name: draft.name,
        email: draft.email,
        phoneNumber: draft.phoneNumber,
        registrationNumber: draft.registrationNumber,
        serviceTypeId: draft.serviceTypeId,
        startsAt,
        ...selected(draft),
      };
  try {
    return parseBooking(await request(previous ? "/" + encodeURIComponent(previous.id) : "", {
      method: previous ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  } catch (error) {
    if (!previous && (error instanceof TypeError || error instanceof DOMException))
      throw new Error("Booking response was lost. Check bookings before submitting again.", { cause: error });
    throw error;
  }
}
export async function setBookingStatus(
  booking: Booking,
  status: BookingStatus,
  cancellationReason?: string,
): Promise<Booking> {
  return parseBooking(
    await request("/" + encodeURIComponent(booking.id) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        expectedVersion: booking.version,
        ...(cancellationReason ? { cancellationReason } : {}),
      }),
    }),
  );
}
let realtime: ReturnType<typeof createClient> | undefined;
export function bookingRealtimeClient() {
  if (realtime) return realtime;
  const url = import.meta.env.VITE_BOOKINGS_SUPABASE_URL,
    key = import.meta.env.VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Booking Realtime is not configured");
  const parsed = new URL(url);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password
  )
    throw new Error("Booking Realtime requires local Supabase");
  realtime = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return realtime;
}
