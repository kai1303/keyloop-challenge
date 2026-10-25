import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import keyloopLogo from "../assets/keyloop-logo.svg";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@keyloop-interview/ui/components/dialog";
import { BookingForm } from "./BookingForm";
import { useCalendarBookings } from "./use-calendar-bookings";
import { bookingRequest } from "./booking-api";
import { monthDays, type Schedule, type Service } from "./calendar-time";

export function BookingCalendar() {
  const reduceMotion = useReducedMotion();
  const [catalog, setCatalog] = useState<{
    schedule: Schedule;
    services: Service[];
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState(DateTime.local().toFormat("yyyy-MM"));
  const [direction, setDirection] = useState(1);
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [expandedDate, setExpandedDate] = useState("");
  const appointments = useCalendarBookings(month, catalog?.schedule.timeZone);
  const anchor = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = "Book a service · Keyloop";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void Promise.all([
      bookingRequest<Schedule>("schedule", { signal: controller.signal }),
      bookingRequest<Service[]>("service-types", { signal: controller.signal }),
    ])
      .then(([schedule, services]) => {
        if (controller.signal.aborted) return;
        setCatalog({ schedule, services });
        setMonth(DateTime.now().setZone(schedule.timeZone).toFormat("yyyy-MM"));
        if (!services.length)
          setError("No services are available for booking yet.");
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load the calendar",
          );
      });
    return () => controller.abort();
  }, [attempt]);

  const zone = catalog?.schedule.timeZone ?? DateTime.local().zoneName;
  const today = DateTime.now().setZone(zone).startOf("day");
  const displayed = DateTime.fromISO(month + "-01", { zone });
  const days = monthDays(month, zone);
  const selectedDay = DateTime.fromISO(selected, { zone });

  function changeMonth(amount: number) {
    setOpen(false);
    setDirection(amount);
    setMonth(displayed.plus({ months: amount }).toFormat("yyyy-MM"));
  }

  return (
    <main className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background px-5 py-4 sm:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a
            href="/appointments"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <img
              src={keyloopLogo}
              alt="Keyloop"
              width={130}
              height={33}
              className="h-8 w-auto shrink-0 dark:invert"
            />{" "}
            <span className="hidden font-normal text-muted-foreground sm:inline">
              / Service booking
            </span>
          </a>
        </div>
      </header>
      <m.div
        className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-10 sm:py-10"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Here to keep you moving
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Book your next service
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Choose a day and time, then select an available technician and
              service bay for your vehicle.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {catalog
              ? "All times in " + zone.replaceAll("_", " ")
              : "Loading dealership hours…"}
          </p>
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-lg border bg-background p-4 text-sm"
          >
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        )}
        {appointments.error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-lg border bg-background p-4 text-sm"
          >
            <p>{appointments.error}</p>
            <Button variant="outline" size="sm" onClick={appointments.refresh}>
              Retry appointments
            </Button>
          </div>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <section
            aria-label="Appointment calendar"
            className="overflow-hidden rounded-xl border bg-background shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-6 sm:py-5">
              <div className="flex items-center gap-3">
                <h2 className="min-w-40 text-xl font-semibold">
                  {displayed.toFormat("LLLL yyyy")}
                </h2>
                <span className="hidden rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">
                  Month
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setMonth(today.toFormat("yyyy-MM"));
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => changeMonth(-1)}
                >
                  ‹
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => changeMonth(1)}
                >
                  ›
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b bg-muted/20 text-center text-xs font-medium text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="py-3">
                  {day}
                </div>
              ))}
            </div>
            <m.div
              key={month}
              className="grid grid-cols-7"
              initial={reduceMotion ? false : { opacity: 0, x: direction * 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.22,
                ease: "easeOut",
              }}
            >
              {days.map((day, index) => {
                const date = day.toISODate()!;
                if (day.toFormat("yyyy-MM") !== month)
                  return (
                    <div
                      key={date}
                      aria-hidden="true"
                      className={
                        "min-h-32 border-b bg-muted/25 sm:min-h-44 lg:min-h-48 " +
                        (index % 7 < 6 ? "border-r" : "")
                      }
                    />
                  );
                const closed =
                  catalog && !catalog.schedule.hours[day.weekday - 1];
                const disabled =
                  !catalog?.services.length ||
                  day < today ||
                  !!closed;
                const label = day
                  .setLocale("en")
                  .toFormat("cccc, LLLL d, yyyy");
                const entries = appointments.items.filter(
                  (item) =>
                    DateTime.fromISO(item.startsAt)
                      .setZone(zone)
                      .toISODate() === date,
                );
                const expanded = expandedDate === date;
                const remaining = Math.max(0, entries.length - 3);
                return (
                  <div
                    key={date}
                    className={
                      "relative flex min-h-32 min-w-0 flex-col gap-2 border-b p-1.5 sm:min-h-44 sm:p-2 lg:min-h-48 lg:p-3 " +
                      (index % 7 < 6 ? "border-r " : "") +
                      (disabled ? "bg-muted/25" : "hover:bg-primary/5")
                    }
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={(disabled ? "" : "Book ") + label}
                      aria-current={
                        day.hasSame(today, "day") ? "date" : undefined
                      }
                      className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-default"
                      onClick={(event) => {
                        anchor.current = event.currentTarget;
                        setSelected(date);
                        setConfirmed(false);
                        setOpen(true);
                      }}
                    />
                    <div
                      className={
                        "pointer-events-none flex justify-center py-0.5 " +
                        (disabled ? "text-muted-foreground/60" : "")
                      }
                    >
                      <span
                        className={
                          "flex size-7 items-center justify-center rounded-full text-sm " +
                          (day.hasSame(today, "day")
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "")
                        }
                      >
                        {day.day}
                      </span>
                    </div>
                    {entries.length > 0 && (
                      <ul
                        aria-label={"Appointments for " + label}
                        className="space-y-1 text-[10px] sm:text-xs"
                      >
                        {(expanded ? entries : entries.slice(0, 3)).map(
                          (item, entryIndex) => {
                            const start = DateTime.fromISO(item.startsAt)
                              .setZone(zone)
                              .toFormat("HH:mm");
                            const end = DateTime.fromISO(item.endsAt)
                              .setZone(zone)
                              .toFormat("HH:mm");
                            return (
                              <li
                                key={entryIndex}
                                className="list-inside list-disc rounded-sm px-0.5 py-1 leading-snug marker:text-primary xl:truncate"
                                title={
                                  start + "–" + end + " " + item.serviceName
                                }
                              >
                                <time
                                  dateTime={item.startsAt}
                                  className="font-medium tabular-nums"
                                >
                                  {start}
                                </time>{" "}
                                <span className="block pl-2.5 xl:inline xl:pl-0">
                                  {item.serviceName}
                                </span>
                              </li>
                            );
                          },
                        )}
                      </ul>
                    )}
                    {remaining > 0 && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={
                          "Show " +
                          (expanded
                            ? "fewer appointments"
                            : remaining +
                              " more appointment" +
                              (remaining === 1 ? "" : "s")) +
                          " for " +
                          day.toFormat("LLLL d")
                        }
                        onClick={() => setExpandedDate(expanded ? "" : date)}
                        className="relative rounded px-1 py-1 text-left text-[10px] font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary sm:text-xs"
                      >
                        {expanded ? "Show less" : "+" + remaining + " more"}
                      </button>
                    )}
                    {closed ? (
                      <span className="mt-auto py-1 text-center text-[10px] text-muted-foreground sm:text-xs">
                        Closed
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </m.div>
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/10 px-4 py-3 text-xs text-muted-foreground sm:px-6">
              <span>
                {appointments.loading
                  ? "Loading appointments…"
                  : "Booked services shown · Customer details hidden"}
              </span>
              <span>Services follow dealership opening hours</span>
            </div>
          </section>
          <AnimatePresence>
            {open && catalog && selected && (
              <DialogContent
                key={selected}
                forceMount
                showCloseButton={false}
                className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-xl sm:max-w-[26rem]"
                aria-label={
                  confirmed ? "Appointment confirmed" : "Book a service"
                }
                aria-describedby="booking-description"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  anchor.current?.focus();
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="flex items-center gap-3 text-xl">
                      {confirmed && (
                        <span
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      )}
                      {confirmed ? "Appointment confirmed" : "Book a service"}
                    </DialogTitle>
                    <DialogDescription
                      id="booking-description"
                      className="mt-1"
                    >
                      {confirmed
                        ? "Your service appointment is booked."
                        : selectedDay.toFormat("cccc, d LLLL yyyy")}
                    </DialogDescription>
                  </div>
                  <DialogClose asChild>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="text-2xl leading-none"
                      aria-label={
                        confirmed ? "Close confirmation" : "Close booking form"
                      }
                    >
                      ×
                    </Button>
                  </DialogClose>
                </div>
                <BookingForm
                  key={selected}
                  date={selected}
                  schedule={catalog.schedule}
                  services={catalog.services}
                  onBooked={() => {
                    setConfirmed(true);
                    appointments.refresh();
                  }}
                />
              </DialogContent>
            )}
          </AnimatePresence>
        </Dialog>
        <p className="text-center text-xs text-muted-foreground">
          A time is reserved only when your appointment is confirmed.
        </p>
      </m.div>
    </main>
  );
}
