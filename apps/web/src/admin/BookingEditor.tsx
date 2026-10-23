import {
  bookingToday,
  bookingHours,
  bookingStarts,
  nextBookingOpening,
  useBookingConfig,
} from "./booking-config";
import { useState } from "react";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@keyloop-interview/ui/components/dialog";
import { Input } from "@keyloop-interview/ui/components/input";
import { Label } from "@keyloop-interview/ui/components/label";
import { Textarea } from "@keyloop-interview/ui/components/textarea";
import { AdminSelect } from "./AdminSelect";
import { endTime, type Booking, type BookingDraft } from "./booking-model";

export function BookingEditor({
  booking,
  initialDate,
  onSave,
  onClose,
  restoreFocus,
}: {
  booking?: Booking;
  initialDate: string;
  onSave: (draft: BookingDraft, id?: string) => Promise<void>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const {
    services: SERVICES,
    technicians: TECHNICIANS,
    bays: BAYS,
    schedule,
  } = useBookingConfig();
  const dealerDate = () => bookingToday(schedule);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<BookingDraft>(() => {
    if (booking) return { ...booking };
    const opening = nextBookingOpening(
      initialDate < dealerDate() ? dealerDate() : initialDate,
      schedule,
    );
    return {
      ...opening,
      name: "",
      email: "",
      phoneNumber: "",
      registrationNumber: "",
      serviceTypeId: SERVICES[0].id,
      technicianId: "auto",
      serviceBayId: "auto",
    };
  });
  const [error, setError] = useState("");
  const set = (key: keyof BookingDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };
  const service = SERVICES.find((item) => item.id === draft.serviceTypeId)!;
  const qualified = TECHNICIANS.filter((tech) =>
    tech.services.includes(draft.serviceTypeId),
  );
  const START_TIMES = bookingStarts(draft.date, schedule);
  const automatic = [{ id: "auto", name: "Assign automatically" }];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {booking ? "Reschedule / reassign" : "New booking"}
          </DialogTitle>
          <DialogDescription>
            {booking
              ? booking.id + " · " + booking.name
              : "Create an appointment for a guest customer."}{" "}
            The technician and bay are assigned when the booking is saved.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError("");
            try {
              await onSave(draft, booking?.id);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Unable to save this booking.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <fieldset disabled={pending} className="contents">
            {!booking && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="admin-guest-name">Full name</Label>
                  <Input
                    id="admin-guest-name"
                    value={draft.name}
                    onChange={(event) => set("name", event.target.value)}
                    autoComplete="name"
                    required
                    maxLength={100}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={draft.email}
                    onChange={(event) => set("email", event.target.value)}
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-phone">Phone number</Label>
                  <Input
                    id="admin-phone"
                    type="tel"
                    value={draft.phoneNumber}
                    onChange={(event) => set("phoneNumber", event.target.value)}
                    autoComplete="tel"
                    required
                    maxLength={30}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="admin-registration">
                    Vehicle registration
                  </Label>
                  <Input
                    id="admin-registration"
                    value={draft.registrationNumber}
                    onChange={(event) =>
                      set("registrationNumber", event.target.value)
                    }
                    required
                    maxLength={32}
                  />
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {booking ? (
                <div className="grid gap-2">
                  <Label htmlFor="admin-fixed-service">Service</Label>
                  <Input
                    id="admin-fixed-service"
                    readOnly
                    value={service.name}
                  />
                </div>
              ) : (
                <AdminSelect
                  label="Service"
                  value={draft.serviceTypeId}
                  onChange={(value) => {
                    setDraft((current) => ({
                      ...current,
                      serviceTypeId: value,
                      technicianId: "auto",
                    }));
                    setError("");
                  }}
                  options={SERVICES}
                />
              )}
              <div className="grid gap-2">
                <Label htmlFor="admin-booking-date">Date</Label>
                <Input
                  id="admin-booking-date"
                  type="date"
                  min={dealerDate()}
                  value={draft.date}
                  onChange={(event) => set("date", event.target.value)}
                  required
                />
              </div>
              <AdminSelect
                label="Start time"
                value={draft.time}
                onChange={(value) => set("time", value)}
                options={START_TIMES.map((time) => ({ id: time, name: time }))}
              />
              <div className="grid gap-2">
                <Label htmlFor="admin-end-time">End time</Label>
                <Input
                  id="admin-end-time"
                  readOnly
                  value={endTime({
                    time: draft.time,
                    durationMinutes: service.durationMinutes,
                  })}
                />
              </div>
              <AdminSelect
                label="Qualified technician"
                value={draft.technicianId}
                onChange={(value) => set("technicianId", value)}
                options={booking ? qualified : [...automatic, ...qualified]}
              />
              <AdminSelect
                label="Service bay"
                value={draft.serviceBayId}
                onChange={(value) => set("serviceBayId", value)}
                options={booking ? BAYS : [...automatic, ...BAYS]}
              />
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Dealership time: {schedule.timeZone}.{" "}
            {bookingHours(draft.date, schedule)
              ? "One-hour appointments follow dealership opening hours."
              : "The dealership is closed on this date."}
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={pending || !START_TIMES.includes(draft.time)}
            >
              {pending
                ? "Saving…"
                : booking
                  ? "Save changes"
                  : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BookingCancellation({
  booking,
  onConfirm,
  onClose,
  restoreFocus,
}: {
  booking: Booking;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Cancel appointment?</DialogTitle>
          <DialogDescription>
            {booking.id} · {booking.name}. Cancellation releases the technician
            and service bay.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const reason = new FormData(event.currentTarget).get("reason");
            setPending(true);
            setError("");
            try {
              await onConfirm(typeof reason === "string" ? reason.trim() : "");
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Unable to cancel booking",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="admin-cancellation-reason">Reason (optional)</Label>
            <Textarea
              id="admin-cancellation-reason"
              name="reason"
              maxLength={500}
              rows={3}
              placeholder="Add context for the team"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Keep appointment
            </Button>
            <Button variant="destructive" type="submit" disabled={pending}>
              Confirm cancellation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
