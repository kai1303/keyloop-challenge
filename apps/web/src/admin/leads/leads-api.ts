import { DEALER_TIMEZONE } from "../dealer-date";

export type LeadSummary = {
  id: string;
  customer_name: string;
  vehicle_interest: string;
  enquiry: string;
  source: string;
  received_at: string;
};
export type Activity = {
  id: string;
  lead_id: string;
  note: string;
  created_at: string;
};
export type LeadDetails = LeadSummary & {
  email: string;
  phone: string;
  activities: Activity[];
};

async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/leads${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : "Unable to load or save lead data. Try again.",
    );
  }
  return response.json() as Promise<T>;
}
export const listLeads = (signal?: AbortSignal) =>
  read<LeadSummary[]>("", { signal });
export const getLead = (id: string, signal?: AbortSignal) =>
  read<LeadDetails>(`/${encodeURIComponent(id)}`, { signal });
export const addActivity = (
  leadId: string,
  body: { id: string; note: string },
) =>
  read<Activity>(`/${encodeURIComponent(leadId)}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEALER_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
});
export const formatLeadTime = (value: string) =>
  formatter.format(new Date(value));
