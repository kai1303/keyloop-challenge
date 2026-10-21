import { Button } from "@keyloop-interview/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keyloop-interview/ui/components/table";
import { formatLeadTime, type LeadSummary } from "./leads-api";

export function LeadInbox({
  leads,
  selectedId,
  onSelect,
}: {
  leads: LeadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!leads.length)
    return (
      <p className="p-6 text-sm text-muted-foreground">No sales leads yet.</p>
    );
  return (
    <Table aria-label="Sales lead inbox" className="lead-inbox-table">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Customer</TableHead>
          <TableHead scope="col">Enquiry</TableHead>
          <TableHead scope="col">Received</TableHead>
          <TableHead scope="col">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow
            key={lead.id}
            data-state={lead.id === selectedId ? "selected" : undefined}
          >
            <TableCell className="whitespace-normal break-words">
              <span className="font-semibold">{lead.customer_name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {lead.vehicle_interest}
              </span>
            </TableCell>
            <TableCell>
              <p className="lead-summary">{lead.enquiry}</p>
            </TableCell>
            <TableCell className="whitespace-normal">
              <time dateTime={lead.received_at}>
                {formatLeadTime(lead.received_at)}
              </time>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="link"
                aria-label={`View ${lead.customer_name}`}
                onClick={() => onSelect(lead.id)}
              >
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
