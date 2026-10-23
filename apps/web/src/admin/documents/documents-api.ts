import { authenticatedFetch } from "../../auth/authenticated-fetch";
export type DocumentSource = string;
export interface VehicleDocument {
  id: string;
  vin: string;
  title: string;
  type: string;
  issuedAt: string;
  source: DocumentSource;
  content: string;
}
export interface DocumentSearchResult {
  vin: string | null;
  documents: VehicleDocument[];
  sources: Record<
    DocumentSource,
    { label: string; status: "ok" | "unavailable"; count: number }
  >;
}
export const DEMO_VIN = "1HGCM82633A004352";
export function normalizeVin(value: string): string {
  const vin = value.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))
    throw new Error(
      "Enter a 17-character VIN using letters and numbers, excluding I, O and Q.",
    );
  return vin;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}
function parseResult(body: unknown, vin: string | null): DocumentSearchResult {
  const invalid = () => {
    throw new Error("Invalid document response. Please retry the search.");
  };
  if (
    !record(body) ||
    body.vin !== vin ||
    !Array.isArray(body.documents) ||
    !record(body.sources)
  )
    return invalid();
  const entries = Object.entries(body.sources);
  if (
    !entries.length ||
    entries.length > 20 ||
    body.documents.length > entries.length * 100
  )
    return invalid();
  const sources: DocumentSearchResult["sources"] = {};
  for (const [source, status] of entries) {
    if (
      !/^[a-z][a-z0-9-]{0,31}$/.test(source) ||
      !record(status) ||
      !text(status.label, 80) ||
      (status.status !== "ok" && status.status !== "unavailable") ||
      !Number.isSafeInteger(status.count) ||
      (status.count as number) < 0 ||
      (status.count as number) > 100 ||
      (status.status === "unavailable" && status.count !== 0)
    )
      return invalid();
    sources[source] = {
      label: status.label,
      status: status.status,
      count: status.count as number,
    };
  }
  const documents: VehicleDocument[] = [];
  const ids = new Set<string>();
  for (const item of body.documents) {
    if (
      !record(item) ||
      typeof item.source !== "string" ||
      !Object.hasOwn(sources, item.source) ||
      !text(item.id, 161) ||
      !item.id.startsWith(item.source + ":") ||
      ids.has(item.id) ||
      typeof item.vin !== "string" ||
      !/^[A-HJ-NPR-Z0-9]{17}$/.test(item.vin) ||
      (vin !== null && item.vin !== vin) ||
      !text(item.title, 240) ||
      !text(item.type, 80) ||
      !text(item.content, 20000) ||
      typeof item.issuedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.issuedAt) ||
      !Number.isFinite(Date.parse(item.issuedAt + "T00:00:00Z")) ||
      new Date(item.issuedAt + "T00:00:00Z").toISOString().slice(0, 10) !==
        item.issuedAt
    )
      return invalid();
    ids.add(item.id);
    documents.push({
      id: item.id,
      vin: item.vin,
      source: item.source,
      title: item.title,
      type: item.type,
      content: item.content,
      issuedAt: item.issuedAt,
    });
  }
  for (const [source, status] of Object.entries(sources)) {
    if (
      status.count !== documents.filter((doc) => doc.source === source).length
    )
      return invalid();
  }
  if (Object.values(sources).every((source) => source.status === "unavailable"))
    return invalid();
  return { vin, documents, sources };
}
export async function searchDocuments(
  value: string,
  signal?: AbortSignal,
): Promise<DocumentSearchResult> {
  const vin = value.trim() ? normalizeVin(value) : null;
  const timeout = AbortSignal.timeout(10000);
  const response = await authenticatedFetch(
    "/api/documents" + (vin === null ? "" : "?vin=" + encodeURIComponent(vin)),
    { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      record(body) && typeof body.message === "string"
        ? body.message
        : "Unable to search documents. Please try again.",
    );
  return parseResult(body, vin);
}
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  dateStyle: "medium",
});
export const documentDate = (date: string) =>
  dateFormat.format(new Date(date + "T00:00:00Z"));
