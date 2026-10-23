import { bookingHours, useBookingConfig } from "./booking-config";
import { useIsMobile } from "@keyloop-interview/ui/lib/use-mobile";
import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@keyloop-interview/ui/components/popover";
import { Badge } from "@keyloop-interview/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keyloop-interview/ui/components/table";
import {
  STATUSES,
  minutes,
  clock,
  endTime,
  type Booking,
} from "./booking-model";

interface Props {
  date: string;
  loading?: boolean;
  bookings: Booking[];
  view: "day" | "list";
  selectedId: string | null;
  onSelect: (booking: Booking) => void;
  detailsOpen: boolean;
  modalOpen: boolean;
  onCloseDetails: (id: string) => void;
  details: ReactNode;
}
export function BookingSchedule({
  date,
  loading = false,
  bookings,
  view,
  selectedId,
  onSelect,
  detailsOpen,
  modalOpen,
  onCloseDetails,
  details,
}: Props) {
  const {
    services: SERVICES,
    technicians: TECHNICIANS,
    bays: BAYS,
    schedule,
  } = useBookingConfig();
  const hours = bookingHours(date, schedule);
  const opening = minutes(hours?.open ?? "09:00");
  const length = Math.ceil((minutes(hours?.close ?? "17:00") - opening) / 60);
  const columns = {
    gridTemplateColumns: `46px repeat(${BAYS.length}, minmax(0,1fr))`,
  };
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  if (view === "list")
    return (
      <Table aria-label="Bookings for selected day">
        <TableHeader>
          <TableRow>
            <TableHead>Time / booking</TableHead>
            <TableHead>Customer / vehicle</TableHead>
            <TableHead>Service / resources</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <TableRow
              key={booking.id}
              data-state={booking.id === selectedId ? "selected" : undefined}
            >
              <TableCell>
                <Popover
                  open={detailsOpen && booking.id === selectedId}
                  onOpenChange={(open) =>
                    open ? onSelect(booking) : onCloseDetails(booking.id)
                  }
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="link"
                      size="sm"
                      aria-label={"View " + booking.id}
                      className="h-auto p-0"
                    >
                      {booking.time} · {booking.id}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    aria-label="Booking details"
                    onCloseAutoFocus={(event) => {
                      if (selectedId !== booking.id) event.preventDefault();
                    }}
                    side={isMobile ? "bottom" : "right"}
                    align="start"
                    sideOffset={10}
                    collisionPadding={12}
                    className="admin-booking-popover"
                    onInteractOutside={(event) => {
                      if (modalOpen) event.preventDefault();
                    }}
                  >
                    {details}
                  </PopoverContent>
                </Popover>
                <p className="mt-1 text-xs text-muted-foreground">
                  Until {endTime(booking)}
                </p>
              </TableCell>
              <TableCell>
                <p className="font-medium">{booking.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {booking.registrationNumber}
                </p>
              </TableCell>
              <TableCell>
                <p>
                  {
                    SERVICES.find(
                      (service) => service.id === booking.serviceTypeId,
                    )?.name
                  }
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {
                    TECHNICIANS.find((tech) => tech.id === booking.technicianId)
                      ?.name
                  }{" "}
                  · {BAYS.find((bay) => bay.id === booking.serviceBayId)?.name}
                </p>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={"admin-status admin-status-" + booking.status}
                >
                  {STATUSES[booking.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  const cancelled = bookings.filter(
    (booking) => booking.status === "CANCELLED",
  );
  return (
    <>
      <div
        className="admin-calendar-scroll"
        role="region"
        aria-label="Daily schedule by service bay"
      >
        <div className="admin-calendar">
          <div className="admin-calendar-head" style={columns}>
            <div aria-hidden="true" />
            {BAYS.map((bay) => (
              <div key={bay.id}>
                <span className="font-medium">{bay.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {loading
                    ? "—"
                    : bookings.filter(
                        (booking) =>
                          booking.serviceBayId === bay.id &&
                          booking.status !== "CANCELLED",
                      ).length}{" "}
                  appointments
                </span>
              </div>
            ))}
          </div>
          <div
            className="admin-calendar-body"
            style={{ ...columns, height: length * 64 + 16 }}
          >
            <div className="admin-time-labels" aria-hidden="true">
              {Array.from({ length: length + 1 }, (_, index) => (
                <span key={index} style={{ top: index * 64 }}>
                  {clock(opening + index * 60)}
                </span>
              ))}
            </div>
            {BAYS.map((bay) => (
              <div
                className="admin-bay-lane"
                key={bay.id}
                aria-label={bay.name}
                style={{ height: length * 64 }}
              >
                {bookings
                  .filter(
                    (booking) =>
                      booking.serviceBayId === bay.id &&
                      booking.status !== "CANCELLED",
                  )
                  .map((booking) => {
                    const service = SERVICES.find(
                      (item) => item.id === booking.serviceTypeId,
                    )!;
                    const tech = TECHNICIANS.find(
                      (item) => item.id === booking.technicianId,
                    )!;
                    return (
                      <Popover
                        key={booking.id}
                        open={detailsOpen && booking.id === selectedId}
                        onOpenChange={(open) =>
                          open ? onSelect(booking) : onCloseDetails(booking.id)
                        }
                      >
                        <PopoverTrigger asChild>
                          <Button
                            asChild
                            variant="outline"
                            className={
                              "admin-appointment admin-appointment-" +
                              booking.status
                            }
                            aria-label={`Select booking ${booking.id}, ${booking.time}–${endTime(booking)}, ${booking.name}, ${service.name}, ${tech.name}, ${STATUSES[booking.status]}`}
                          >
                            <m.button
                              type="button"
                              initial={false}
                              animate={{
                                top:
                                  ((minutes(booking.time) - opening) / 60) *
                                    64 +
                                  2,
                                height: (booking.durationMinutes / 60) * 64 - 4,
                              }}
                              transition={{
                                duration: reduceMotion ? 0 : 0.2,
                                ease: "easeOut",
                              }}
                              whileHover={reduceMotion ? undefined : { y: -2 }}
                              whileTap={
                                reduceMotion ? undefined : { scale: 0.98 }
                              }
                            >
                              <span className="admin-appointment-title">
                                {booking.time} · {booking.name.split(" ")[0]}
                              </span>
                              {booking.durationMinutes >= 60 && (
                                <span className="admin-appointment-meta">
                                  {booking.status === "CANCELLED" ||
                                  booking.status === "IN_SERVICE"
                                    ? STATUSES[booking.status]
                                    : service.name}{" "}
                                  · {tech.name}
                                </span>
                              )}
                              <span className="sr-only">
                                {STATUSES[booking.status]}
                              </span>
                            </m.button>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          aria-label="Booking details"
                          onCloseAutoFocus={(event) => {
                            if (selectedId !== booking.id)
                              event.preventDefault();
                          }}
                          side={isMobile ? "bottom" : "right"}
                          align="start"
                          sideOffset={10}
                          collisionPadding={12}
                          className="admin-booking-popover"
                          onInteractOutside={(event) => {
                            if (modalOpen) event.preventDefault();
                          }}
                        >
                          {details}
                        </PopoverContent>
                      </Popover>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {cancelled.length > 0 && (
        <section aria-label="Cancelled bookings">
          <h3 className="mt-4 text-sm font-medium">Cancelled bookings</h3>
          <BookingSchedule
            date={date}
            bookings={cancelled}
            view="list"
            selectedId={selectedId}
            onSelect={onSelect}
            detailsOpen={detailsOpen}
            modalOpen={modalOpen}
            onCloseDetails={onCloseDetails}
            details={details}
          />
        </section>
      )}
    </>
  );
}
