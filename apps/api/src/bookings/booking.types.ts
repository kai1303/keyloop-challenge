export interface BookingInput {
  name: string;
  email: string;
  phoneNumber: string;
  registrationNumber: string;
  serviceTypeId: string;
  startsAt: string;
}
export interface ServiceType {
  id: string;
  name: string;
  durationMinutes: number;
}
export interface Interval {
  startsAt: Date;
  endsAt: Date;
  date: string;
}
export interface ResourcePair {
  technicianId: string;
  bayId: string;
}
export interface ResourceAvailability {
  technicians: { id: string; name: string }[];
  bays: { id: string; name: string }[];
}
export interface Availability extends ResourceAvailability {
  serviceTypeId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
}
export interface Confirmation {
  id: string;
  service: ServiceType;
  registrationNumber: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED';
}

export interface CalendarBooking {
  startsAt: string;
  endsAt: string;
  serviceName: string;
}
export interface BookingSnapshot {
  month: string;
  bookings: CalendarBooking[];
}

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  available: boolean;
}
export interface DayAvailability {
  serviceTypeId: string;
  date: string;
  slots: AvailabilitySlot[];
}

export type BookingStatus =
  'CONFIRMED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';
export interface AdminBooking extends BookingInput {
  id: string;
  date: string;
  time: string;
  technicianId: string;
  serviceBayId: string;
  durationMinutes: number;
  status: BookingStatus;
  cancellationReason?: string;
  version: number;
  endsAt: string;
}
export interface AdminResourceSelection {
  technicianId?: string;
  serviceBayId?: string;
}
export interface RescheduleInput extends AdminResourceSelection {
  startsAt: string;
  expectedVersion: number;
}
export interface StatusInput {
  status: BookingStatus;
  cancellationReason?: string;
  expectedVersion: number;
}
