import { Clock3, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Badge } from "@keyloop-interview/ui/components/badge";
import { Button } from "@keyloop-interview/ui/components/button";
import { Calendar } from "@keyloop-interview/ui/components/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@keyloop-interview/ui/components/popover";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@keyloop-interview/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@keyloop-interview/ui/components/dialog";
import { Input } from "@keyloop-interview/ui/components/input";
import { Label } from "@keyloop-interview/ui/components/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@keyloop-interview/ui/components/tabs";
import { AdminSelect } from "./AdminSelect";
import { BookingDetails } from "./BookingDetails";
import { BookingEditor, BookingCancellation } from "./BookingEditor";
import { BookingSchedule } from "./BookingSchedule";
import {
  STATUSES,
  filterBookings,
  formatDate,
  shiftDate,
  minutes,
  type Booking,
  type BookingDraft,
  type BookingStatus,
} from "./booking-model";
import { DateTime } from "luxon";
import {
  BookingConfigContext,
  useBookingConfig,
  bookingHours,
  bookingToday,
} from "./booking-config";
import { useAdminBookings } from "./useAdminBookings";
import "./booking-dashboard.css";

type Modal = "new" | "edit" | "cancel" | "resources" | "hours" | null;
const metricVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

export function BookingDashboard() {
  const state = useAdminBookings();
  if (!state.catalog)
    return (
      <div className="p-6">
        <h1>Booking management</h1>
        {state.error ? (
          <>
            <p role="alert">{state.error}</p>
            <Button onClick={() => void state.refresh()}>Retry bookings</Button>
          </>
        ) : (
          <p role="status">Loading booking configuration…</p>
        )}
      </div>
    );
  return (
    <BookingConfigContext.Provider value={state.catalog}>
      <BookingBoard
        bookings={state.bookings}
        date={state.date}
        setDate={state.setDate}
        onSave={state.save}
        onStatus={state.changeStatus}
        loading={state.loading}
        error={state.error}
        refresh={state.refresh}
        busy={state.busy}
        connected={state.connected}
      />
    </BookingConfigContext.Provider>
  );
}

export function BookingBoard({
  bookings,
  date,
  setDate,
  onSave,
  onStatus,
  loading = false,
  error = null,
  refresh,
  busy = false,
  connected = false,
}: {
  bookings: Booking[];
  date: string;
  setDate: (date: string) => void;
  onSave: (draft: BookingDraft, previous?: Booking) => Promise<Booking>;
  onStatus: (
    booking: Booking,
    status: BookingStatus,
    reason?: string,
  ) => Promise<Booking>;
  loading?: boolean;
  error?: string | null;
  refresh: () => Promise<void>;
  busy?: boolean;
  connected?: boolean;
}) {
  const {
    services: SERVICES,
    technicians: TECHNICIANS,
    bays: BAYS,
    schedule,
  } = useBookingConfig();
  const DEALER_TIMEZONE = schedule.timeZone;
  const dealerDate = (now = new Date()) => bookingToday(schedule, now);
  const isClosed = (value: string) => !bookingHours(value, schedule);
  const hours = bookingHours(date, schedule);
  const scheduleHeight =
    (hours ? Math.ceil((minutes(hours.close) - minutes(hours.open)) / 60) : 8) *
      64 +
    84;
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? false : { opacity: 0, y: 8 };
  const transition = {
    duration: reduceMotion ? 0 : 0.24,
    ease: "easeOut" as const,
  };
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const calendarDate = DateTime.fromISO(date + "T12:00", {
    zone: DEALER_TIMEZONE,
  }).toJSDate();
  const [view, setView] = useState<"day" | "list">("day");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const [technicianId, setTechnicianId] = useState("all");
  const [{ id: selectedId, open: detailsOpen }, setSelection] = useState<{
    id: string | null;
    open: boolean;
  }>({ id: null, open: false });
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [editingBooking, setEditingBooking] = useState<Booking>();
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const dateButton = useRef<HTMLButtonElement | null>(null);
  const visible = filterBookings(bookings, {
    date,
    search,
    status,
    technicianId,
  });
  const selected = visible.find((booking) => booking.id === selectedId);
  const daily = bookings.filter((booking) => booking.date === date);
  const filtered = Boolean(
    search || status !== "all" || technicianId !== "all",
  );
  useEffect(() => {
    const previous = document.title;
    document.title = "Booking management · Keyloop";
    return () => {
      document.title = previous;
    };
  }, []);
  function openModal(next: Modal) {
    dialogTrigger.current = document.activeElement as HTMLElement;
    if (next === "edit" || next === "cancel") setEditingBooking(selected);
    setModal(next);
  }
  function restoreFocus() {
    const target = dialogTrigger.current?.isConnected
      ? dialogTrigger.current
      : dateButton.current;
    target?.focus();
  }
  function clearFilters() {
    setSearch("");
    setStatus("all");
    setTechnicianId("all");
  }
  function select(booking: Booking) {
    setSelection({ id: booking.id, open: true });
  }
  function closeDetails(id = selectedId) {
    setSelection((current) =>
      current.id === id ? { ...current, open: false } : current,
    );
  }
  async function save(draft: BookingDraft, existingId?: string) {
    const result = await onSave(draft, existingId ? editingBooking : undefined);
    setDate(result.date);
    clearFilters();
    setSelection({ id: result.id, open: false });
    setModal(null);
    setNotice(
      existingId
        ? result.id +
            " rescheduled. Both resources are available for the full service."
        : result.id +
            " confirmed. A qualified technician and bay have been assigned.",
    );
  }
  async function updateStatus(
    next: BookingStatus,
    reason?: string,
    target = selected,
  ) {
    if (!target) return;
    try {
      const result = await onStatus(target, next, reason);
      setModal(null);
      if (next === "CANCELLED") closeDetails();
      setNotice(
        result.id +
          ": " +
          STATUSES[next].toLowerCase() +
          (next === "CANCELLED"
            ? ". The technician and bay have been released."
            : "."),
      );
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "Unable to update booking.",
      );
      throw failure;
    }
  }
  return (
    <>
      <m.header
        className="admin-header"
        initial={entrance}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <div>
          <p className="admin-eyebrow">SERVICE DESK / APPOINTMENTS</p>
          <h1>Booking management</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One dealership{" "}
            <span className="mx-1" aria-hidden="true">
              ·
            </span>{" "}
            {DEALER_TIMEZONE}
          </p>
        </div>
      </m.header>
      <div
        role="toolbar"
        aria-label="Booking tools"
        className="mb-6 flex flex-wrap gap-2"
      >
        <Button variant="outline" onClick={() => openModal("resources")}>
          <LayoutGrid aria-hidden="true" />
          Resources
        </Button>
        <Button variant="outline" onClick={() => openModal("hours")}>
          <Clock3 aria-hidden="true" />
          Opening hours
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button variant="outline" onClick={() => void refresh()}>
            Retry bookings
          </Button>
        </div>
      )}
      <m.section
        className="admin-metrics"
        aria-label="Selected day summary"
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: reduceMotion ? 0 : 0.06 },
          },
        }}
      >
        {[
          {
            label: "Bookings on this day",
            value: daily.length,
            description: "Includes cancelled appointments",
          },
          {
            label: "In service",
            value: daily.filter((booking) => booking.status === "IN_SERVICE")
              .length,
            description: "Currently with a technician",
          },
          {
            label: "To arrive",
            value: daily.filter((booking) => booking.status === "CONFIRMED")
              .length,
            description: "Confirmed appointments",
          },
        ].map((metric) => (
          <m.div variants={metricVariants} key={metric.label}>
            <Card className="h-full gap-2 py-4">
              <CardHeader className="gap-2 px-4">
                <CardDescription className="text-foreground font-medium">
                  {metric.label}
                </CardDescription>
                <CardTitle className="font-heading text-[28px] tabular-nums">
                  {loading ? "—" : metric.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                {metric.description}
              </CardContent>
            </Card>
          </m.div>
        ))}
      </m.section>
      <m.div
        initial={entrance}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transition, delay: reduceMotion ? 0 : 0.08 }}
      >
        <Card className="admin-board gap-0 py-0">
          <CardContent className="space-y-6 p-4 sm:p-6">
            <div className="admin-filters">
              <div className="grid gap-2">
                <Label htmlFor="admin-search">Find a booking</Label>
                <Input
                  id="admin-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, email, vehicle or booking ID"
                />
              </div>
              <AdminSelect
                label="Status"
                value={status}
                onChange={(value) => setStatus(value as BookingStatus | "all")}
                options={[
                  { id: "all", name: "All statuses" },
                  ...Object.entries(STATUSES).map(([id, name]) => ({
                    id,
                    name,
                  })),
                ]}
              />
              <AdminSelect
                label="Technician"
                value={technicianId}
                onChange={setTechnicianId}
                options={[
                  { id: "all", name: "All technicians" },
                  ...TECHNICIANS,
                ]}
              />
            </div>
            <div className="admin-workspace">
              <Tabs
                className="min-w-0"
                value={view}
                onValueChange={(value) => {
                  setView(value as "day" | "list");
                  closeDetails();
                }}
              >
                <div className="admin-schedule-toolbar">
                  <div className="flex flex-wrap items-end gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Previous day"
                      onClick={() => setDate(shiftDate(date, -1))}
                    >
                      ‹
                    </Button>
                    <div className="grid gap-1">
                      <Label htmlFor="admin-date" className="text-xs">
                        Schedule date
                      </Label>
                      <Popover
                        open={datePickerOpen}
                        onOpenChange={setDatePickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            id="admin-date"
                            ref={dateButton}
                            variant="outline"
                            aria-label={"Schedule date: " + formatDate(date)}
                            className="justify-start font-normal"
                          >
                            {formatDate(date)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          asChild
                          aria-label="Choose schedule date"
                          className="w-auto p-0"
                          align="start"
                          collisionPadding={12}
                        >
                          <m.div
                            initial={entrance}
                            animate={{ opacity: 1, y: 0 }}
                            transition={transition}
                          >
                            <Calendar
                              mode="single"
                              required
                              timeZone={DEALER_TIMEZONE}
                              selected={calendarDate}
                              defaultMonth={calendarDate}
                              autoFocus
                              onSelect={(day) => {
                                setDate(
                                  DateTime.fromJSDate(day)
                                    .setZone(DEALER_TIMEZONE)
                                    .toISODate()!,
                                );
                                closeDetails();
                                setDatePickerOpen(false);
                              }}
                            />
                          </m.div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Next day"
                      onClick={() => setDate(shiftDate(date, 1))}
                    >
                      ›
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDate(dealerDate())}
                    >
                      Today
                    </Button>
                  </div>
                  <TabsList
                    aria-label="Schedule view"
                    className="admin-view-switch"
                  >
                    <TabsTrigger value="day" className="admin-view-tab">
                      Day
                    </TabsTrigger>
                    <TabsTrigger value="list" className="admin-view-tab">
                      List
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-heading text-sm font-semibold">
                    {formatDate(date)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {hours
                      ? `Open ${hours.open}–${hours.close}`
                      : "Dealership closed"}
                  </span>
                </div>
                <TabsContent value={view} asChild>
                  <div
                    className="admin-schedule-content"
                    style={{ minHeight: scheduleHeight }}
                    aria-busy={loading}
                  >
                    <BookingSchedule
                      date={date}
                      loading={loading}
                      bookings={loading ? [] : visible}
                      view={view}
                      selectedId={selected?.id ?? null}
                      onSelect={select}
                      detailsOpen={detailsOpen}
                      modalOpen={modal !== null}
                      onCloseDetails={closeDetails}
                      details={
                        <BookingDetails
                          booking={selected}
                          onClose={() => closeDetails()}
                          onEdit={() => openModal("edit")}
                          onCancel={() => openModal("cancel")}
                          onStatus={(status) => {
                            void updateStatus(status).catch(() => undefined);
                          }}
                          busy={busy || !!error}
                        />
                      }
                    />
                    {loading ? (
                      <p
                        role="status"
                        className="admin-schedule-overlay text-sm text-muted-foreground"
                      >
                        <span className="rounded-md border bg-card px-4 py-2">
                          Loading bookings…
                        </span>
                      </p>
                    ) : (
                      filtered &&
                      visible.length === 0 && (
                        <div className="admin-empty admin-schedule-overlay">
                          <h3>No bookings match your filters.</h3>
                          <p>Try a different customer, status or technician.</p>
                          <Button variant="outline" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                </TabsContent>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {loading ? "—" : visible.length}{" "}
                    {visible.length === 1 ? "booking" : "bookings"} shown
                    {filtered ? " · filtered" : ""}
                  </span>
                  {filtered && visible.length > 0 && (
                    <Button variant="link" size="xs" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                  {!loading &&
                    !filtered &&
                    daily.length === 0 &&
                    !isClosed(date) && (
                      <Button
                        variant="outline"
                        onClick={() => openModal("new")}
                        disabled={busy || !!error}
                      >
                        New booking
                      </Button>
                    )}
                  <span>All times are dealership local</span>
                </div>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </m.div>
      <p
        role="status"
        aria-live="polite"
        className="mt-4 min-h-6 text-sm font-medium"
      >
        <m.span
          key={notice}
          className="inline-block"
          initial={entrance}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
        >
          {notice}
        </m.span>
      </p>
      <footer className="admin-page-footer">
        <span>Keyloop · Service operations</span>
        <span>
          Bookings saved to PostgreSQL ·{" "}
          {connected ? "Live updates connected" : "Live updates disconnected"}
        </span>
      </footer>
      {(modal === "new" || (modal === "edit" && editingBooking)) && (
        <BookingEditor
          initialDate={date}
          key={modal + (editingBooking?.id ?? "")}
          booking={modal === "edit" ? editingBooking : undefined}
          onSave={save}
          onClose={() => setModal(null)}
          restoreFocus={restoreFocus}
        />
      )}
      {modal === "cancel" && editingBooking && (
        <BookingCancellation
          booking={editingBooking}
          onConfirm={(reason) =>
            updateStatus("CANCELLED", reason, editingBooking)
          }
          onClose={() => setModal(null)}
          restoreFocus={restoreFocus}
        />
      )}
      {(modal === "resources" || modal === "hours") && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {modal === "resources"
                  ? "Service resources"
                  : "Dealership opening hours"}
              </DialogTitle>
              <DialogDescription>
                Dealership service configuration.
              </DialogDescription>
            </DialogHeader>
            {modal === "resources" ? (
              <div className="space-y-5">
                <section>
                  <h3 className="mb-3 font-semibold">Qualified technicians</h3>
                  <dl className="space-y-3">
                    {TECHNICIANS.map((tech) => (
                      <div
                        key={tech.id}
                        className="flex justify-between gap-4 text-sm"
                      >
                        <dt>{tech.name}</dt>
                        <dd className="text-right text-muted-foreground">
                          {tech.services
                            .map(
                              (id) =>
                                SERVICES.find((service) => service.id === id)
                                  ?.name,
                            )
                            .join(", ")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className="border-t pt-4">
                  <h3 className="mb-3 font-semibold">Service bays</h3>
                  <div className="flex flex-wrap gap-2">
                    {BAYS.map((bay) => (
                      <Badge variant="outline" key={bay.id}>
                        {bay.name}
                      </Badge>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <dl className="grid gap-4 text-sm">
                {schedule.hours.map((day, index) => (
                  <div className="flex justify-between gap-4" key={index}>
                    <dt>
                      {
                        [
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                          "Sunday",
                        ][index]
                      }
                    </dt>
                    <dd>{day ? `${day.open}–${day.close}` : "Closed"}</dd>
                  </div>
                ))}
                <div className="border-t pt-4">
                  <dt className="text-muted-foreground">Dealership timezone</dt>
                  <dd className="mt-1">{DEALER_TIMEZONE}</dd>
                </div>
              </dl>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
