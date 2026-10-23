import { useBookingConfig } from "./booking-config";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import {
  PopoverHeader,
  PopoverTitle,
} from "@keyloop-interview/ui/components/popover";
import { Separator } from "@keyloop-interview/ui/components/separator";
import { Badge } from "@keyloop-interview/ui/components/badge";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  STATUSES,
  endTime,
  formatDate,
  type Booking,
  type BookingStatus,
} from "./booking-model";

interface Props {
  booking: Booking | undefined;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onStatus: (status: BookingStatus) => void;
  busy?: boolean;
}
export function BookingDetails({
  booking,
  onClose,
  onEdit,
  onCancel,
  onStatus,
  busy = false,
}: Props) {
  const {
    services: SERVICES,
    technicians: TECHNICIANS,
    bays: BAYS,
  } = useBookingConfig();
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? false : { opacity: 0, x: 10 };
  const transition = {
    duration: reduceMotion ? 0 : 0.2,
    ease: "easeOut" as const,
  };
  return (
    <div className="admin-details">
      <m.div
        key={booking?.id ?? "empty"}
        initial={entrance}
        animate={{ opacity: 1, x: 0 }}
        transition={transition}
      >
        <PopoverHeader className="flex-row items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Appointment details
            </p>
            <PopoverTitle className="font-heading text-xl font-semibold">
              {booking?.id ?? "Select a booking"}
            </PopoverTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close booking details"
            onClick={onClose}
          >
            ×
          </Button>
        </PopoverHeader>
        {!booking ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Choose an appointment in the calendar or list to view customer
            details and manage the service.
          </p>
        ) : (
          <>
            <Badge
              variant="outline"
              className={"admin-status mt-3 admin-status-" + booking.status}
            >
              {STATUSES[booking.status]}
            </Badge>
            <Separator className="mt-5" />
            <section className="admin-detail-section">
              <h3>Appointment</h3>
              <dl>
                <div>
                  <dt>Service</dt>
                  <dd>
                    {
                      SERVICES.find(
                        (service) => service.id === booking.serviceTypeId,
                      )?.name
                    }{" "}
                    · {booking.durationMinutes} minutes
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(booking.date)}</dd>
                </div>
                <div>
                  <dt>Time · dealership local</dt>
                  <dd>
                    {booking.time}–{endTime(booking)}
                  </dd>
                </div>
                <div>
                  <dt>Technician</dt>
                  <dd>
                    {
                      TECHNICIANS.find(
                        (tech) => tech.id === booking.technicianId,
                      )?.name
                    }
                  </dd>
                </div>
                <div>
                  <dt>Service bay</dt>
                  <dd>
                    {BAYS.find((bay) => bay.id === booking.serviceBayId)?.name}
                  </dd>
                </div>
              </dl>
            </section>
            <Separator className="mt-5" />
            <section className="admin-detail-section">
              <h3>Customer & vehicle</h3>
              <dl>
                <div>
                  <dt>Name</dt>
                  <dd>{booking.name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{booking.email}</dd>
                </div>
                <div>
                  <dt>Phone number</dt>
                  <dd>{booking.phoneNumber}</dd>
                </div>
                <div>
                  <dt>Vehicle registration</dt>
                  <dd>{booking.registrationNumber}</dd>
                </div>
                {booking.cancellationReason && (
                  <div>
                    <dt>Cancellation reason</dt>
                    <dd>{booking.cancellationReason}</dd>
                  </div>
                )}
              </dl>
            </section>
            <div className="mt-6 flex flex-col gap-2">
              {booking.status === "CONFIRMED" && (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => onStatus("IN_SERVICE")}
                  >
                    Start service
                  </Button>
                  <Button disabled={busy} variant="outline" onClick={onEdit}>
                    Reschedule / reassign
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    className="text-destructive"
                    onClick={onCancel}
                  >
                    Cancel booking
                  </Button>
                </>
              )}
              {booking.status === "IN_SERVICE" && (
                <Button disabled={busy} onClick={() => onStatus("COMPLETED")}>
                  Complete service
                </Button>
              )}
              {booking.status === "COMPLETED" && (
                <p className="text-sm text-muted-foreground">
                  Service completed. This appointment is read-only.
                </p>
              )}
              {booking.status === "CANCELLED" && (
                <p className="text-sm text-muted-foreground">
                  The technician and bay have been released.
                </p>
              )}
            </div>
          </>
        )}
      </m.div>
    </div>
  );
}
