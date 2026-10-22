import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Timeline,
  TimelineItem,
} from "@keyloop-interview/ui/components/timeline";
import { formatLeadTime, type LeadDetails as LeadRecord } from "./leads-api";

export function LeadDetails({
  lead,
  onLog,
}: {
  lead: LeadRecord;
  onLog: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <m.div
      key={lead.id}
      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="admin-eyebrow">LEAD DETAILS</p>
          <h2 className="font-heading text-xl font-semibold">
            {lead.customer_name}
          </h2>
        </div>
        <Button onClick={onLog}>Log activity</Button>
      </div>
      <dl className="lead-facts mt-5">
        {[
          ["Reference", lead.id],
          ["Email", lead.email],
          ["Phone", lead.phone],
          ["Vehicle of interest", lead.vehicle_interest],
          ["Source", lead.source],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Received · Asia/Ho_Chi_Minh</dt>
          <dd>
            <time dateTime={lead.received_at}>
              {formatLeadTime(lead.received_at)}
            </time>
          </dd>
        </div>
      </dl>
      <section className="lead-section" aria-labelledby="lead-enquiry-heading">
        <h3 id="lead-enquiry-heading">Original enquiry</h3>
        <p className="lead-note">{lead.enquiry}</p>
      </section>
      <section className="lead-section" aria-labelledby="lead-history-heading">
        <h3 id="lead-history-heading">Follow-up history</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Oldest first · Asia/Ho_Chi_Minh
        </p>
        {lead.activities.length ? (
          <Timeline aria-label="Follow-up activities">
            {lead.activities.map((activity) => (
              <TimelineItem key={activity.id}>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={activity.created_at}
                >
                  {formatLeadTime(activity.created_at)}
                </time>
                <p className="lead-note mt-1">{activity.note}</p>
              </TimelineItem>
            ))}
          </Timeline>
        ) : (
          <p className="text-sm text-muted-foreground">
            No follow-up activities yet.
          </p>
        )}
      </section>
    </m.div>
  );
}
