import { useId, useState } from "react";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@keyloop-interview/ui/components/dialog";
import { Label } from "@keyloop-interview/ui/components/label";
import { Textarea } from "@keyloop-interview/ui/components/textarea";
import { AdminSelect } from "../AdminSelect";
import { getInventory, InventoryError, saveAction } from "./inventory-api";
import { ACTIONS, type Action, type Vehicle } from "./inventory-model";

export function InventoryActionDialog({
  vehicle,
  onClose,
  onSaved,
  restoreFocus,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSaved: (saved: Vehicle) => void;
  restoreFocus: () => void;
}) {
  const noteId = useId();
  const [base, setBase] = useState(vehicle);
  const [action, setAction] = useState<Action | "">(
    vehicle.currentAction ?? "",
  );
  const [note, setNote] = useState(vehicle.note ?? "");
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function reviewLatest() {
    setReviewing(true);
    try {
      const snapshot = await getInventory();
      const latest = snapshot.vehicles.find((item) => item.id === vehicle.id);
      if (!latest)
        throw new InventoryError("Vehicle is no longer in inventory", 404);
      if (!latest.aging)
        throw new InventoryError("Vehicle is no longer aging stock", 400);
      setBase(latest);
      setAction(latest.currentAction ?? "");
      setNote(latest.note ?? "");
      setConflict(false);
      setError(null);
      setNotice("Latest action loaded. Review it before saving.");
    } catch (failure) {
      if (failure instanceof InventoryError && failure.status === 404)
        setMissing(true);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load the latest action",
      );
    } finally {
      setReviewing(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving && !reviewing) onClose();
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
            {vehicle.currentAction
              ? "Edit vehicle action"
              : "Log vehicle action"}
          </DialogTitle>
          <DialogDescription>
            {vehicle.registration} · {vehicle.make} {vehicle.model} ·{" "}
            {vehicle.daysInStock} days in stock. Saves persist in local
            Supabase.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!action || saving || reviewing || conflict || missing) return;
            setSaving(true);
            setError(null);
            setNotice("");
            try {
              onSaved(
                await saveAction(vehicle.id, {
                  action,
                  note: note.trim(),
                  expectedVersion: base.version,
                }),
              );
            } catch (failure) {
              setConflict(
                failure instanceof InventoryError && failure.status === 409,
              );
              setMissing(
                failure instanceof InventoryError && failure.status === 404,
              );
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Unable to save action. Please retry.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <AdminSelect
            label="Current action"
            value={action}
            onChange={(value) => setAction(value as Action)}
            options={ACTIONS.map((value) => ({ id: value, name: value }))}
            disabled={saving || reviewing}
          />
          <div className="grid gap-2">
            <Label htmlFor={noteId}>Note (optional)</Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              rows={4}
              disabled={saving || reviewing}
              aria-describedby={noteId + "-help"}
            />
            <p id={noteId + "-help"} className="text-xs text-muted-foreground">
              Up to 1,000 characters. Only the current action is retained.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {conflict && !missing && (
            <Button
              type="button"
              variant="outline"
              disabled={reviewing}
              onClick={() => void reviewLatest()}
            >
              Load latest action (replaces draft)
            </Button>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving || reviewing}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!action || saving || reviewing || conflict || missing}
            >
              {saving ? "Saving…" : "Save action"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
