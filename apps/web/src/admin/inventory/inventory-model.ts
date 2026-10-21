import { DEALER_TIMEZONE, dealerDate } from "../dealer-date";
export const ACTIONS = [
  "Price Reduction Planned",
  "Marketing Push Planned",
  "Wholesale Review Planned",
  "Monitor Stock",
] as const;
export type Action = (typeof ACTIONS)[number];
export type Age = "all" | "0-30" | "31-60" | "61-90" | "aging";
export interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  modelYear: number;
  pricePence: number;
  stockedOn: string;
  currentAction: Action | null;
  note: string | null;
  actionUpdatedAt: string | null;
  version: number;
  daysInStock: number;
  aging: boolean;
}
export interface InventorySnapshot {
  vehicles: Vehicle[];
  dealershipDate: string;
  timeZone: string;
  serverTime: string;
}
export interface Filters {
  make: string;
  model: string;
  age: Age;
}
export interface ActionDraft {
  action: Action;
  note: string;
  expectedVersion: number;
}
export const AGE_OPTIONS = [
  { id: "all", name: "All stock ages" },
  { id: "0-30", name: "0–30 days" },
  { id: "31-60", name: "31–60 days" },
  { id: "61-90", name: "61–90 days" },
  { id: "aging", name: "Over 90 days" },
];
function dateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(value + "T00:00:00Z");
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function integer(
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
export function parseVehicle(value: unknown): Vehicle {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      value.id,
    ) ||
    !["registration", "make", "model"].every(
      (key) =>
        typeof value[key] === "string" && String(value[key]).trim().length > 0,
    ) ||
    !integer(value.modelYear, 1886, 2100) ||
    !integer(value.pricePence, 0, 2147483647) ||
    !dateOnly(value.stockedOn) ||
    !integer(value.version, 0, 2147483647) ||
    !integer(value.daysInStock, 0) ||
    value.aging !== value.daysInStock > 90 ||
    !(
      value.currentAction === null ||
      ACTIONS.includes(value.currentAction as Action)
    ) ||
    !(
      value.note === null ||
      (typeof value.note === "string" && value.note.length <= 1000)
    ) ||
    !(
      value.actionUpdatedAt === null ||
      (typeof value.actionUpdatedAt === "string" &&
        Number.isFinite(Date.parse(value.actionUpdatedAt)))
    ) ||
    (value.currentAction === null &&
      (value.note !== null || value.actionUpdatedAt !== null)) ||
    (value.currentAction !== null && value.actionUpdatedAt === null)
  ) {
    throw new Error("Inventory service returned invalid vehicle data");
  }
  return value as unknown as Vehicle;
}
export function parseSnapshot(value: unknown): InventorySnapshot {
  if (
    !record(value) ||
    !Array.isArray(value.vehicles) ||
    !dateOnly(value.dealershipDate) ||
    value.timeZone !== DEALER_TIMEZONE ||
    typeof value.serverTime !== "string" ||
    !Number.isFinite(Date.parse(value.serverTime)) ||
    dealerDate(new Date(value.serverTime)) !== value.dealershipDate
  )
    throw new Error("Inventory service returned an invalid snapshot");
  const vehicles = value.vehicles.map(parseVehicle);
  const today = value.dealershipDate;
  if (
    new Set(vehicles.map((vehicle) => vehicle.id)).size !== vehicles.length ||
    vehicles.some(
      (vehicle) =>
        (Date.parse(today + "T00:00:00Z") -
          Date.parse(vehicle.stockedOn + "T00:00:00Z")) /
          86400000 !==
        vehicle.daysInStock,
    )
  )
    throw new Error("Inventory dates or vehicle IDs are inconsistent");
  return {
    vehicles,
    dealershipDate: today,
    timeZone: value.timeZone,
    serverTime: value.serverTime,
  };
}
export function filterVehicles(
  vehicles: Vehicle[],
  filters: Filters,
): Vehicle[] {
  return vehicles
    .filter((vehicle) => {
      const age = vehicle.daysInStock;
      const matchesAge =
        filters.age === "all" ||
        (filters.age === "aging"
          ? age > 90
          : filters.age === "0-30"
            ? age <= 30
            : filters.age === "31-60"
              ? age >= 31 && age <= 60
              : age >= 61 && age <= 90);
      return (
        (filters.make === "all" || vehicle.make === filters.make) &&
        (filters.model === "all" || vehicle.model === filters.model) &&
        matchesAge
      );
    })
    .sort((a, b) => b.daysInStock - a.daysInStock || a.id.localeCompare(b.id));
}
export function summary(vehicles: Vehicle[]) {
  return {
    total: vehicles.length,
    aging: vehicles.filter((v) => v.aging).length,
    needsAction: vehicles.filter((v) => v.aging && !v.currentAction).length,
  };
}
export function money(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(pence / 100);
}
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DEALER_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function midnightDelay(snapshot: InventorySnapshot): number {
  // shortcut: this dealership uses fixed UTC+07, replace this calculation if its configured timezone changes.
  const nextMidnight =
    Date.parse(snapshot.dealershipDate + "T00:00:00+07:00") + 86400000;
  return Math.max(1000, nextMidnight - Date.parse(snapshot.serverTime) + 50);
}
