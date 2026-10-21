import { useRef, useState, type FormEvent } from "react";
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
import { addActivity, type Activity, type LeadDetails } from "./leads-api";

export function ActivityDialog({
  lead,
  onSaved,
  onClose,
}: {
  lead: LeadDetails;
  onSaved: (activity: Activity) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const attempt = useRef<{ id: string; note: string } | null>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const note = draft.trim();
    if (!note || note.length > 2000) {
      setError("Enter an activity note of 1–2,000 characters.");
      return;
    }
    if (attempt.current?.note !== note)
      attempt.current = { id: crypto.randomUUID(), note };
    pending.current = true;
    setSaving(true);
    setError("");
    let activity: Activity;
    try {
      activity = await addActivity(lead.id, attempt.current);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save. Try again.",
      );
      return;
    } finally {
      pending.current = false;
      setSaving(false);
    }
    onSaved(activity);
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!saving}
        onEscapeKeyDown={(event) => {
          if (pending.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
          <DialogDescription>
            Record a follow-up for {lead.customer_name}. This note will be saved
            to their history.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" aria-busy={saving}>
          <div className="grid gap-2">
            <Label htmlFor="lead-activity-note">Activity note</Label>
            <Textarea
              id="lead-activity-note"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              required
              maxLength={2000}
              rows={5}
              disabled={saving}
              aria-invalid={Boolean(error)}
              aria-describedby={
                error
                  ? "lead-activity-help lead-activity-error"
                  : "lead-activity-help"
              }
            />
            <p
              id="lead-activity-help"
              className="text-xs text-muted-foreground"
            >
              Describe what happened. Up to 2,000 characters.
            </p>
          </div>
          {error && (
            <p
              id="lead-activity-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                if (!pending.current) onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
