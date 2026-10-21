import { useEffect, useState } from "react";
import { Badge } from "@keyloop-interview/ui/components/badge";
import { Button } from "@keyloop-interview/ui/components/button";
import { Card, CardContent } from "@keyloop-interview/ui/components/card";
import { LeadInbox } from "./LeadInbox";
import { LeadDetails } from "./LeadDetails";
import { ActivityDialog } from "./ActivityDialog";
import {
  getLead,
  listLeads,
  type Activity,
  type LeadDetails as LeadRecord,
  type LeadSummary,
} from "./leads-api";
import "./leads.css";

export function LeadsDashboard() {
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [inboxAttempt, setInboxAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadRecord | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [dialogLead, setDialogLead] = useState<LeadRecord | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const oldTitle = document.title;
    document.title = "Sales Leads · Keyloop";
    return () => {
      document.title = oldTitle;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLeads(null);
    setInboxError("");
    listLeads(controller.signal)
      .then((value) => {
        if (active) setLeads(value);
      })
      .catch((error) => {
        if (active)
          setInboxError(
            error instanceof Error ? error.message : "Unable to load leads.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [inboxAttempt]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    let active = true;
    setDetail(null);
    setDetailError("");
    getLead(selectedId, controller.signal)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((error) => {
        if (active)
          setDetailError(
            error instanceof Error
              ? error.message
              : "Unable to load this lead.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId, detailAttempt]);

  function select(id: string) {
    setNotice("");
    setDetail(null);
    setDetailError("");
    if (id === selectedId) setDetailAttempt((value) => value + 1);
    else setSelectedId(id);
  }
  function saved(activity: Activity) {
    setDetail((current) =>
      current?.id === activity.lead_id
        ? {
            ...current,
            activities: [
              ...current.activities.filter((entry) => entry.id !== activity.id),
              activity,
            ].sort(
              (a, b) =>
                Date.parse(a.created_at) - Date.parse(b.created_at) ||
                a.id.localeCompare(b.id),
            ),
          }
        : current,
    );
    setNotice("Activity saved to the local database.");
  }
  const visibleDetail = detail?.id === selectedId ? detail : null;
  return (
    <>
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">DEMAND / SALES</p>
          <h1>Sales Leads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Website enquiries and follow-up history
          </p>
        </div>
        <Badge variant="outline">Fictional leads · saved activities</Badge>
      </header>
      <Card className="gap-0 py-0">
        <CardContent className="p-4 sm:p-6">
          <div className="leads-workspace">
            <section className="min-w-0" aria-labelledby="lead-inbox-heading">
              <h2
                id="lead-inbox-heading"
                className="mb-4 font-heading text-lg font-semibold"
              >
                Lead inbox
              </h2>
              {inboxError ? (
                <div role="alert">
                  <p>{inboxError}</p>
                  <Button
                    variant="outline"
                    onClick={() => setInboxAttempt((value) => value + 1)}
                  >
                    Retry inbox
                  </Button>
                </div>
              ) : leads === null ? (
                <p>Loading leads…</p>
              ) : (
                <LeadInbox
                  leads={leads}
                  selectedId={selectedId}
                  onSelect={select}
                />
              )}
            </section>
            <aside
              className="lead-details"
              aria-label="Lead details"
              aria-busy={Boolean(selectedId && !visibleDetail && !detailError)}
            >
              {!selectedId ? (
                <p className="text-sm text-muted-foreground">
                  Select a lead to view the enquiry and follow-up history.
                </p>
              ) : detailError ? (
                <div role="alert">
                  <p>{detailError}</p>
                  <Button
                    variant="outline"
                    onClick={() => setDetailAttempt((value) => value + 1)}
                  >
                    Retry lead details
                  </Button>
                </div>
              ) : !visibleDetail ? (
                <p>Loading lead details…</p>
              ) : (
                <LeadDetails
                  lead={visibleDetail}
                  onLog={() => setDialogLead(visibleDetail)}
                />
              )}
            </aside>
          </div>
        </CardContent>
      </Card>
      <p
        role="status"
        aria-live="polite"
        className="mt-4 min-h-6 text-sm font-medium"
      >
        {notice}
      </p>
      <footer className="admin-page-footer">
        <span>Keyloop · Sales operations</span>
        <span>Local demo · no live website connection</span>
      </footer>
      {dialogLead && (
        <ActivityDialog
          lead={dialogLead}
          onSaved={saved}
          onClose={() => setDialogLead(null)}
        />
      )}
    </>
  );
}
