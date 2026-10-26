import { useEffect, useState, type FormEvent } from "react";
import { DateTime } from "luxon";
import { Button } from "@keyloop-interview/ui/components/button";
import { DialogClose } from "@keyloop-interview/ui/components/dialog";
import { Input } from "@keyloop-interview/ui/components/input";
import { Label } from "@keyloop-interview/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@keyloop-interview/ui/components/select";
import { bookingRequest, BookingRequestError } from "./booking-api";
import { startTimes, type Schedule, type Service } from "./calendar-time";
import { publicRealtimeClient } from "./public-realtime";
import { watchAvailability } from "./watch-availability";

interface Resource {
  id: string;
  name: string;
}
interface ResourceAvailability {
  available: boolean;
  technicians: Resource[];
  bays: Resource[];
}
interface Confirmation {
  id: string;
  startsAt: string;
  endsAt: string;
  service: Service;
  status: string;
}

export function BookingForm({
  date,
  schedule,
  services,
  onBooked,
}: {
  date: string;
  schedule: Schedule;
  services: Service[];
  onBooked: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0].id);
  const service = services.find((item) => item.id === serviceId)!;
  const [chosenTime, setChosenTime] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [bayId, setBayId] = useState("");
  const slots = startTimes(date, service.durationMinutes, schedule);
  const startsAt =
    chosenTime && slots.some((slot) => slot.value === chosenTime)
      ? chosenTime
      : "";
  const endTime = startsAt
    ? DateTime.fromISO(startsAt)
        .setZone(schedule.timeZone)
        .plus({ minutes: service.durationMinutes })
        .toFormat("HH:mm")
    : "";
  const key = serviceId + ":" + startsAt;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: ResourceAvailability;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const resources =
    snapshot?.key === key ? snapshot.data : { technicians: [], bays: [] };
  const available = snapshot?.key === key ? snapshot.data.available : null;
  const selectedAvailable =
    resources.technicians.some((item) => item.id === technicianId) &&
    resources.bays.some((item) => item.id === bayId);
  const canSubmit =
    !checking &&
    !!startsAt &&
    !!technicianId &&
    !!bayId &&
    !uncertain &&
    selectedAvailable;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const refresh = () => setAttempt((value) => value + 1);

  useEffect(() => {
    setChosenTime((previous) =>
      previous === null
        ? (startTimes(date, service.durationMinutes, schedule)[0]?.value ?? "")
        : previous,
    );
  }, [date, serviceId, service.durationMinutes, schedule]);

  useEffect(() => {
    if (confirmation || !startsAt) {
      setChecking(false);
      return;
    }
    let active = true;
    let request: AbortController | undefined;
    setSnapshot(null);
    setChecking(true);
    setConnected(false);
    setAvailabilityError("");
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      setChecking(true);
      try {
        const data = await bookingRequest<ResourceAvailability>(
          "availability?" +
            new URLSearchParams({ serviceTypeId: serviceId, startsAt }),
          { signal: controller.signal },
        );
        if (active && !controller.signal.aborted) {
          setSnapshot({ key, data });
          setAvailabilityError("");
        }
      } catch (failure) {
        if (active && !controller.signal.aborted) {
          setSnapshot(null);
          setAvailabilityError(
            failure instanceof Error
              ? failure.message
              : "Unable to load available resources",
          );
        }
      } finally {
        if (active && request === controller) setChecking(false);
      }
    }
    let stop: () => void;
    try {
      stop = watchAvailability(publicRealtimeClient(), date, {
        initialLoad: true,
        refresh: load,
        onConnection: setConnected,
        onError: () => {
          setSnapshot(null);
          setAvailabilityError("Unable to refresh available resources");
        },
      });
    } catch {
      void load();
      const focus = () => {
        void load();
      };
      window.addEventListener("focus", focus);
      stop = () => window.removeEventListener("focus", focus);
    }
    return () => {
      active = false;
      request?.abort();
      stop();
    };
  }, [date, serviceId, startsAt, attempt, confirmation]);

  useEffect(() => {
    if (
      !snapshot ||
      snapshot.key !== key ||
      pending ||
      confirmation
    )
      return;
    setTechnicianId((previous) =>
      snapshot.data.technicians.some((item) => item.id === previous)
        ? previous
        : "",
    );
    setBayId((previous) =>
      snapshot.data.bays.some((item) => item.id === previous) ? previous : "",
    );
  }, [snapshot, key, pending, confirmation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canSubmit) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const body = JSON.stringify({
      ...fields,
      serviceTypeId: serviceId,
      startsAt,
      technicianId,
      serviceBayId: bayId,
    });
    setPending(true);
    setError("");
    try {
      const booking = await bookingRequest<Confirmation>("bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });
      setUncertain(false);
      setConfirmation(booking);
      onBooked();
    } catch (failure) {
      const unknown = !(
        failure instanceof BookingRequestError && failure.status < 500
      );
      setUncertain(unknown);
      if (unknown) onBooked();
      if (failure instanceof BookingRequestError && failure.status === 409)
        refresh();
      setError(
        unknown
          ? "Confirmation may have succeeded. Check the calendar or contact staff before trying again."
          : failure instanceof Error
            ? failure.message
            : "Unable to confirm appointment",
      );
    } finally {
      setPending(false);
    }
  }

  if (confirmation)
    return (
      <div className="space-y-5" role="status">
        <dl className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Service</dt>
            <dd className="text-right font-medium">
              {confirmation.service.name} ·{" "}
              {confirmation.service.durationMinutes} minutes
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-right font-medium">
              {DateTime.fromISO(confirmation.startsAt)
                .setZone(schedule.timeZone)
                .toFormat("cccc, d LLLL yyyy")}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="text-right font-medium tabular-nums">
              {DateTime.fromISO(confirmation.startsAt)
                .setZone(schedule.timeZone)
                .toFormat("HH:mm")}{" "}
              –{" "}
              {DateTime.fromISO(confirmation.endsAt)
                .setZone(schedule.timeZone)
                .toFormat("HH:mm")}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Time zone</dt>
            <dd className="break-words text-right font-medium">
              {schedule.timeZone.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
        <p className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Booking reference</span>
          <span className="block break-all font-mono text-foreground">
            {confirmation.id}
          </span>
        </p>
        <DialogClose asChild>
          <Button type="button" className="w-full">
            Done
          </Button>
        </DialogClose>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-70">
        <div className="space-y-1.5">
          <Label htmlFor="booking-service">Service</Label>
          <Select
            value={serviceId}
            onValueChange={(value) => {
              setServiceId(value);
              setChosenTime(null);
              setTechnicianId("");
              setBayId("");
              setUncertain(false);
              setError("");
            }}
          >
            <SelectTrigger id="booking-service" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {services.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="booking-time">Start time</Label>
            <Select
              value={startsAt}
              onValueChange={(value) => {
                setChosenTime(value);
                setTechnicianId("");
                setBayId("");
                setUncertain(false);
                setError("");
              }}
              disabled={!slots.length}
            >
              <SelectTrigger id="booking-time" className="w-full">
                <SelectValue
                  placeholder={
                    slots.length ? "Select a time" : "No start times"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {slots.map((slot) => (
                  <SelectItem key={slot.value} value={slot.value}>
                    {slot.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="booking-end-time">End time</Label>
            <Input
              id="booking-end-time"
              value={endTime}
              readOnly
              placeholder="—"
              aria-describedby="booking-duration"
              className="bg-muted/40 text-muted-foreground"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            {
              id: "technician",
              label: "Available technician",
              placeholder: "Select a technician",
              value: technicianId,
              set: setTechnicianId,
              options: resources.technicians,
            },
            {
              id: "bay",
              label: "Available bay",
              placeholder: "Select a bay",
              value: bayId,
              set: setBayId,
              options: resources.bays,
            },
          ].map((field) => {
            return (
              <div key={field.id} className="space-y-1.5">
                <Label htmlFor={"booking-" + field.id}>{field.label}</Label>
                <Select
                  value={field.value}
                  required
                  disabled={checking || !startsAt || !field.options.length}
                  onValueChange={(value) => {
                    field.set(value);
                    setUncertain(false);
                    setError("");
                  }}
                >
                  <SelectTrigger id={"booking-" + field.id} className="w-full">
                    <SelectValue
                      placeholder={
                        !startsAt
                          ? "Select a time first"
                          : !field.options.length
                            ? "None available"
                            : field.placeholder
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {field.options.length} available for this time
                </p>
              </div>
            );
          })}
        </div>
        <p id="booking-duration" className="text-xs text-muted-foreground">
          {service.durationMinutes} minutes · Times in {schedule.timeZone} · End
          time calculated automatically
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="booking-name">Full name</Label>
          <Input
            id="booking-name"
            name="name"
            autoComplete="name"
            maxLength={100}
            required
            placeholder="Your full name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="booking-email">Email</Label>
          <Input
            id="booking-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="booking-phone">Phone number</Label>
            <Input
              id="booking-phone"
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              pattern={"\\+?[0-9][0-9 \\(\\)\\-]{5,28}[0-9]"}
              required
              placeholder="+84 901 234 567"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="booking-vehicle">Vehicle registration</Label>
            <Input
              id="booking-vehicle"
              name="registrationNumber"
              maxLength={32}
              required
              placeholder="AB-123"
            />
          </div>
        </div>
      </fieldset>
      <div aria-live="polite" className="space-y-1 text-sm">
        <p
          className={
            available === false ? "text-destructive" : "text-muted-foreground"
          }
        >
          {checking
            ? "Checking availability…"
            : !slots.length
              ? "No start times remain for this service."
              : !startsAt
                ? "Choose a start time to see available technicians and bays."
                : available === true
                  ? "Available at last check"
                  : available === false
                    ? "This time is fully booked. Choose another time."
                    : "Availability will be checked before confirmation."}
        </p>
        <p className="text-xs text-muted-foreground">
          {connected
            ? "Live availability connected"
            : "Live updates disconnected · Confirmation checks again"}
        </p>
      </div>
      {(error || availabilityError) && (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-sm text-destructive">
            {error || availabilityError}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setError("");
              refresh();
            }}
          >
            Retry times
          </Button>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={pending || !canSubmit}>
        {pending ? "Confirming…" : "Confirm appointment"}
      </Button>
    </form>
  );
}
