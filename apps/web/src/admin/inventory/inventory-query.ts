import type {
  Filters,
  InventorySnapshot,
  InventorySort,
} from "./inventory-model";
export interface InventoryQuery extends Filters {
  action: string;
  sorting: InventorySort[];
  pageSize: number;
  after: string | null;
}
export interface InventoryPage extends InventorySnapshot {
  nextCursor: string | null;
  pageSize: number;
}
export interface InventoryMetadata {
  summary: { total: number; aging: number; needsAction: number };
  options: Record<string, string[]>;
}
export const DEFAULT_INVENTORY_QUERY: InventoryQuery = {
  make: "all",
  model: "all",
  age: "all",
  action: "all",
  sorting: [{ key: "daysInStock", direction: "desc" }],
  pageSize: 25,
  after: null,
};
export function inventorySearchParams(query: InventoryQuery): string {
  const params = new URLSearchParams({
    age: query.age,
    action: query.action,
    sort: query.sorting
      .map((item) => item.key + ":" + item.direction)
      .join(","),
    limit: String(query.pageSize),
  });
  if (query.make !== "all") params.set("make", query.make);
  if (query.model !== "all") params.set("model", query.model);
  if (query.after) params.set("after", query.after);
  return params.toString();
}
export function parseInventoryMetadata(value: unknown): InventoryMetadata {
  const data = value as InventoryMetadata;
  if (
    !data ||
    typeof data !== "object" ||
    !data.summary ||
    typeof data.summary !== "object" ||
    !data.options ||
    typeof data.options !== "object" ||
    Array.isArray(data.options) ||
    !["total", "aging", "needsAction"].every(
      (key) =>
        Number.isSafeInteger(data.summary[key as keyof typeof data.summary]) &&
        data.summary[key as keyof typeof data.summary] >= 0,
    ) ||
    data.summary.aging > data.summary.total ||
    data.summary.needsAction > data.summary.aging ||
    Object.entries(data.options).some(
      ([make, models]) =>
        !make.trim() ||
        make.length > 80 ||
        !Array.isArray(models) ||
        models.some(
          (model) =>
            typeof model !== "string" || !model.trim() || model.length > 80,
        ),
    )
  )
    throw new Error("Inventory service returned invalid summary data");
  return data;
}
