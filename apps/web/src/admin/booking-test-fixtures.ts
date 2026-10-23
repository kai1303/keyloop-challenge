import { shiftDate, type Booking } from "./booking-model";
import { dealerDate } from "./dealer-date";
import type { BookingCatalog } from "./booking-config";
export const SERVICES = [
  { id: "oil", name: "Oil change", durationMinutes: 60 },
  { id: "inspection", name: "Inspection", durationMinutes: 60 },
];
export const TECHNICIANS = [
  { id: "avery", name: "Avery", services: ["oil"] },
  { id: "jordan", name: "Jordan", services: ["inspection"] },
  { id: "casey", name: "Casey", services: ["oil", "inspection"] },
];
export const BAYS = [
  { id: "bay-1", name: "Service bay 1" },
  { id: "bay-2", name: "Service bay 2" },
  { id: "bay-3", name: "Service bay 3" },
];

export const TEST_BOOKING_CATALOG: BookingCatalog = {
  services: SERVICES,
  technicians: TECHNICIANS,
  bays: BAYS,
  schedule: {
    timeZone: "Asia/Ho_Chi_Minh",
    hours: [
      ...Array.from({ length: 5 }, () => ({ open: "09:00", close: "17:00" })),
      null,
      null,
    ],
  },
};
function isClosed(date: string) {
  return [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay());
}

export function createDemoBookings(date = dealerDate()): Booking[] {
  while (isClosed(date)) date = shiftDate(date, 1);
  const common = { date, version: 1, phoneNumber: "+84000000000" };
  return [
    {
      ...common,
      id: "BK-1041",
      name: "Alex Morgan",
      email: "alex@example.com",
      registrationNumber: "AB-123",
      serviceTypeId: "oil",
      durationMinutes: 60,
      time: "09:00",
      technicianId: "avery",
      serviceBayId: "bay-1",
      status: "COMPLETED",
    },
    {
      ...common,
      id: "BK-1042",
      name: "Sam Taylor",
      email: "sam@example.com",
      registrationNumber: "CD-456",
      serviceTypeId: "inspection",
      durationMinutes: 60,
      time: "10:00",
      technicianId: "jordan",
      serviceBayId: "bay-2",
      status: "IN_SERVICE",
    },
    {
      ...common,
      id: "BK-1043",
      name: "Jamie Lee",
      email: "jamie@example.com",
      registrationNumber: "EF-789",
      serviceTypeId: "inspection",
      durationMinutes: 60,
      time: "11:00",
      technicianId: "casey",
      serviceBayId: "bay-3",
      status: "CONFIRMED",
    },
    {
      ...common,
      id: "BK-1044",
      name: "Riley Chen",
      email: "riley@example.com",
      registrationNumber: "GH-012",
      serviceTypeId: "oil",
      durationMinutes: 60,
      time: "13:00",
      technicianId: "avery",
      serviceBayId: "bay-1",
      status: "CONFIRMED",
    },
    {
      ...common,
      id: "BK-1045",
      name: "Morgan Davis",
      email: "morgan@example.com",
      registrationNumber: "JK-345",
      serviceTypeId: "inspection",
      durationMinutes: 60,
      time: "14:00",
      technicianId: "jordan",
      serviceBayId: "bay-2",
      status: "CANCELLED",
    },
  ];
}
