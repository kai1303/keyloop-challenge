import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@keyloop-interview/ui/components/button";
import { Input } from "@keyloop-interview/ui/components/input";
import { Label } from "@keyloop-interview/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@keyloop-interview/ui/components/select";
import { publicRealtimeClient } from "./public-realtime";
import { watchAvailability } from "./watch-availability";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
}
interface Snapshot {
  serviceTypeId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
}
interface Selection {
  serviceTypeId: string;
  startsAt: string;
}

export function AvailabilityMonitor() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/service-types", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load services");
        const rows = (await response.json()) as Service[];
        setServices(rows);
        setServiceTypeId(rows[0]?.id ?? "");
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(String(failure.message ?? failure));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selection) return;
    let active = true;
    let stop: (() => void) | undefined;
    let request: AbortController | undefined;

    function report(failure: unknown) {
      if (
        !active ||
        (failure instanceof DOMException && failure.name === "AbortError")
      )
        return;
      setSnapshot(null);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to refresh availability",
      );
    }

    async function refresh(): Promise<void> {
      request?.abort();
      request = new AbortController();
      const query = new URLSearchParams({
        serviceTypeId: selection!.serviceTypeId,
        startsAt: selection!.startsAt,
      });
      const response = await fetch("/api/availability?" + query, {
        signal: request.signal,
      });
      if (!response.ok) {
        throw new Error(
          "Availability check failed (" +
            response.status +
            "). Check the selected time.",
        );
      }
      const value = (await response.json()) as Snapshot;
      if (!active) return;
      setSnapshot(value);
      setError("");
      if (!stop) {
        stop = watchAvailability(publicRealtimeClient(), value.date, {
          refresh,
          onConnection: setConnected,
          onError: report,
        });
      }
    }

    setConnected(false);
    setSnapshot(null);
    setError("");
    void refresh().catch(report);
    return () => {
      active = false;
      request?.abort();
      stop?.();
    };
  }, [selection]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = new Date(localTime);
    if (!Number.isFinite(start.getTime())) {
      setError("Choose a valid start time");
      return;
    }
    setSelection({ serviceTypeId, startsAt: start.toISOString() });
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Appointment availability</h1>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="appointment-service">Service</Label>
          <Select
            value={serviceTypeId}
            onValueChange={(value) => {
              setServiceTypeId(value);
              setSelection(null);
              setSnapshot(null);
              setConnected(false);
            }}
            disabled={!services.length}
          >
            <SelectTrigger id="appointment-service">
              <SelectValue placeholder="Select a service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name} ({service.durationMinutes} minutes)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="appointment-start">
            Start time in your local timezone
          </Label>
          <Input
            id="appointment-start"
            type="datetime-local"
            required
            value={localTime}
            onChange={(event) => {
              setLocalTime(event.target.value);
              setSelection(null);
              setSnapshot(null);
              setConnected(false);
            }}
          />
        </div>
        <Button type="submit" disabled={!serviceTypeId || !localTime}>
          Check availability
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite" className="space-y-2">
        <p>
          {connected ? "Live updates connected" : "Live updates disconnected"}
        </p>
        {snapshot && (
          <>
            <p>
              {snapshot.available
                ? "Available at last check"
                : "Unavailable at last check"}
            </p>
            <p>
              {new Date(snapshot.startsAt).toLocaleString()} –{" "}
              {new Date(snapshot.endsAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Availability does not reserve a technician or bay. Confirmation always
        checks again.
      </p>
    </main>
  );
}
