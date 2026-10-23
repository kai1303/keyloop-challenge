import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  columnFilteringFeature,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  DEFAULT_INVENTORY_QUERY,
  type InventoryQuery,
} from "./inventory-query";
import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, FilterX } from "lucide-react";
import { AdminSelect } from "../AdminSelect";
import { Badge } from "@keyloop-interview/ui/components/badge";
import { Button } from "@keyloop-interview/ui/components/button";
import { Label } from "@keyloop-interview/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@keyloop-interview/ui/components/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@keyloop-interview/ui/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keyloop-interview/ui/components/table";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@keyloop-interview/ui/components/popover";
import { useIsMobile } from "@keyloop-interview/ui/lib/use-mobile";
import { InventoryDetails } from "./InventoryDetails";
import {
  ACTIONS,
  AGE_OPTIONS,
  money,
  type InventorySort,
  type Vehicle,
} from "./inventory-model";

const features = tableFeatures({ rowSortingFeature, columnFilteringFeature });
const columns: ColumnDef<typeof features, Vehicle>[] = [
  { id: "vehicle", accessorFn: (row) => row.make + " " + row.model },
  { accessorKey: "registration" },
  { accessorKey: "pricePence" },
  { accessorKey: "daysInStock" },
  { accessorKey: "currentAction" },
  { id: "manage" },
];

function ColumnHeader({
  label,
  column,
  sort,
  onSort,
  filtered = false,
  children,
}: {
  label: string;
  column: InventorySort["key"];
  sort: InventorySort[];
  onSort: (sort: InventorySort, append?: boolean) => void;
  filtered?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const position = sort.findIndex((item) => item.key === column);
  const active = sort[position];
  const Icon = active
    ? active?.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <TableHead
      aria-sort={
        active
          ? position > 0
            ? "other"
            : active.direction === "asc"
              ? "ascending"
              : "descending"
          : "none"
      }
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-label={label + " column options"}
          >
            {label}
            {active && sort.length > 1 && (
              <span className="text-xs">{position + 1}</span>
            )}
            <Icon aria-hidden="true" />
            {filtered && <Filter aria-hidden="true" className="text-primary" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={label + " column options"}
          className="w-64 space-y-4"
        >
          <p className="text-sm font-medium">{label}</p>
          <div className="grid gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              aria-pressed={active && active?.direction === "asc"}
              onClick={() => {
                onSort({ key: column, direction: "asc" });
                setOpen(false);
              }}
            >
              <ArrowUp aria-hidden="true" />
              Sort ascending
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              aria-pressed={active && active?.direction === "desc"}
              onClick={() => {
                onSort({ key: column, direction: "desc" });
                setOpen(false);
              }}
            >
              <ArrowDown aria-hidden="true" />
              Sort descending
            </Button>
            {sort.length < 3 && !active && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    onSort({ key: column, direction: "asc" }, true);
                    setOpen(false);
                  }}
                >
                  Add ascending sort
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    onSort({ key: column, direction: "desc" }, true);
                    setOpen(false);
                  }}
                >
                  Add descending sort
                </Button>
              </>
            )}
          </div>
          {children && (
            <div className="grid gap-3 border-t pt-4">{children}</div>
          )}
        </PopoverContent>
      </Popover>
    </TableHead>
  );
}

export function InventoryTable({
  vehicles,
  selectedId,
  onSelect,
  onAction,
  modalOpen,
  query,
  onQueryChange,
  options,
  total,
  updating,
  placeholder,
  page,
  hasNext,
  onNext,
  onPrevious,
}: {
  vehicles: Vehicle[];
  query: InventoryQuery;
  onQueryChange: (query: InventoryQuery) => void;
  options: Record<string, string[]>;
  total: number | null;
  updating: boolean;
  placeholder: boolean;
  page: number;
  hasNext: boolean;
  onNext: () => void;
  onPrevious: () => void;
  selectedId: string | null;
  onSelect: (vehicle: Vehicle | null) => void;
  modalOpen: boolean;
  onAction: (vehicle: Vehicle, trigger: HTMLElement) => void;
}) {
  const isMobile = useIsMobile();
  const pageSizeId = useId();
  const filters = query;
  const sort = query.sorting;
  const setSort = (next: InventorySort, append = false) =>
    onQueryChange({ ...query, sorting: append ? [...sort, next] : [next] });
  const table = useTable({
    features,
    columns,
    data: vehicles,
    getRowId: (row) => row.id,
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting: sort.map((item) => ({
        id: item.key,
        desc: item.direction === "desc",
      })),
      columnFilters: [
        { id: "vehicle", value: [query.make, query.model] },
        { id: "daysInStock", value: query.age },
        { id: "currentAction", value: query.action },
      ],
    },
  });
  const visible = table.getRowModel().rows.map((row) => row.original);
  const makes = Object.keys(options).sort();
  const models = [
    ...new Set(
      filters.make === "all"
        ? Object.values(options).flat()
        : (options[filters.make] ?? []),
    ),
  ].sort();
  const vehicleFiltered = filters.make !== "all" || filters.model !== "all";
  const filtered =
    vehicleFiltered || filters.age !== "all" || query.action !== "all";
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading font-semibold">Vehicle inventory</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={!filtered}
          onClick={() =>
            onQueryChange({
              ...DEFAULT_INVENTORY_QUERY,
              sorting: sort,
              pageSize: query.pageSize,
            })
          }
        >
          <FilterX aria-hidden="true" />
          Clear filters
        </Button>
      </div>
      <Table
        aria-label="Vehicle inventory"
        className="inventory-table"
        aria-busy={updating}
      >
        <TableHeader>
          <TableRow>
            <ColumnHeader
              label="Vehicle"
              column="vehicle"
              sort={sort}
              onSort={setSort}
              filtered={vehicleFiltered}
            >
              <AdminSelect
                label="Make"
                value={filters.make}
                options={[
                  { id: "all", name: "All makes" },
                  ...makes.map((value) => ({ id: value, name: value })),
                ]}
                onChange={(make) =>
                  onQueryChange({ ...query, make, model: "all" })
                }
              />
              <AdminSelect
                label="Model"
                value={filters.model}
                options={[
                  { id: "all", name: "All models" },
                  ...models.map((value) => ({ id: value, name: value })),
                ]}
                onChange={(model) => onQueryChange({ ...query, model })}
              />
            </ColumnHeader>
            <ColumnHeader
              label="Registration"
              column="registration"
              sort={sort}
              onSort={setSort}
            />
            <ColumnHeader
              label="Price"
              column="pricePence"
              sort={sort}
              onSort={setSort}
            />
            <ColumnHeader
              label="Days in stock"
              column="daysInStock"
              sort={sort}
              onSort={setSort}
              filtered={filters.age !== "all"}
            >
              <AdminSelect
                label="Days in stock"
                value={filters.age}
                options={AGE_OPTIONS}
                onChange={(age) =>
                  onQueryChange({ ...query, age: age as InventoryQuery["age"] })
                }
              />
            </ColumnHeader>
            <ColumnHeader
              label="Current action"
              column="currentAction"
              sort={sort}
              onSort={setSort}
              filtered={query.action !== "all"}
            >
              <AdminSelect
                label="Action status"
                value={query.action}
                onChange={(action) => onQueryChange({ ...query, action })}
                options={[
                  { id: "all", name: "All action statuses" },
                  { id: "needsAction", name: "Needs action" },
                  ...ACTIONS.map((action) => ({ id: action, name: action })),
                ]}
              />
            </ColumnHeader>
            <TableHead>Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((vehicle) => (
            <TableRow
              key={vehicle.id}
              data-aging={vehicle.aging ? "true" : undefined}
              data-state={selectedId === vehicle.id ? "selected" : undefined}
            >
              <TableCell>
                <Popover
                  open={selectedId === vehicle.id}
                  onOpenChange={(open) => onSelect(open ? vehicle : null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      aria-label={"View " + vehicle.registration}
                    >
                      {vehicle.make} {vehicle.model}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    aria-label="Vehicle details"
                    className="inventory-details-popover"
                    side={isMobile ? "bottom" : "right"}
                    align="start"
                    sideOffset={10}
                    collisionPadding={12}
                    onInteractOutside={(event) => {
                      if (modalOpen) event.preventDefault();
                    }}
                    onCloseAutoFocus={(event) => {
                      if (modalOpen || selectedId !== vehicle.id)
                        event.preventDefault();
                    }}
                  >
                    <InventoryDetails
                      vehicle={vehicle}
                      onClose={() => onSelect(null)}
                      onAction={onAction}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  {vehicle.modelYear}
                </p>
              </TableCell>
              <TableCell>{vehicle.registration}</TableCell>
              <TableCell>{money(vehicle.pricePence)}</TableCell>
              <TableCell>
                <p>{vehicle.daysInStock} days</p>
                {vehicle.aging && <Badge variant="outline">Aging stock</Badge>}
              </TableCell>
              <TableCell>
                {vehicle.currentAction ??
                  (vehicle.aging ? (
                    <Badge variant="outline">Needs action</Badge>
                  ) : (
                    "—"
                  ))}
              </TableCell>
              <TableCell>
                {vehicle.aging ? (
                  <Button
                    size="sm"
                    className="bg-[image:var(--kl-gradient-operate)] hover:opacity-90"
                    aria-label={
                      (vehicle.currentAction
                        ? "Edit action for "
                        : "Log action for ") + vehicle.registration
                    }
                    onClick={(event) => onAction(vehicle, event.currentTarget)}
                  >
                    {vehicle.currentAction ? "Edit action" : "Log action"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No action required
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!visible.length && (
            <TableRow>
              <TableCell colSpan={6}>
                <div className="admin-empty">
                  <h3>
                    {filtered
                      ? "No vehicles match your filters."
                      : "No vehicles in inventory."}
                  </h3>
                  <p>
                    {filtered
                      ? "Change the make, model, stock age or action status."
                      : "No vehicle records have been loaded for this dealership."}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span aria-live="polite">
            {placeholder
              ? "Updating results…"
              : `${visible.length} vehicles on this page`}
            {total !== null
              ? ` · ${total.toLocaleString("en-GB")} dealership total`
              : ""}
            {filtered ? " · filtered" : ""}
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-4 xl:w-auto xl:gap-6">
          <div className="flex items-center gap-2">
            <Label htmlFor={pageSizeId} className="whitespace-nowrap text-xs">
              Rows per page
            </Label>
            <Select
              value={String(query.pageSize)}
              disabled={updating}
              onValueChange={(size) =>
                onQueryChange({ ...query, pageSize: Number(size) })
              }
            >
              <SelectTrigger id={pageSizeId} size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Pagination
            aria-label="Inventory pagination"
            className="mx-0 ml-auto w-auto text-foreground"
          >
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  type="button"
                  size="sm"
                  onClick={onPrevious}
                  disabled={page === 1 || updating}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink
                  isActive
                  asChild
                  size="sm"
                  className="tabular-nums shadow-none"
                >
                  <span>Page {page.toLocaleString("en-GB")}</span>
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  type="button"
                  size="sm"
                  onClick={onNext}
                  disabled={!hasNext || updating}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
      {sort.length > 1 && (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label="Active sorting"
        >
          {sort.map((item, index) => (
            <Button
              key={item.key}
              size="xs"
              variant="outline"
              aria-label={"Remove sort " + item.key}
              onClick={() =>
                onQueryChange({
                  ...query,
                  sorting: sort.filter((sortItem) => sortItem.key !== item.key),
                })
              }
            >
              {index + 1}.{" "}
              {
                {
                  vehicle: "Vehicle",
                  registration: "Registration",
                  pricePence: "Price",
                  daysInStock: "Days in stock",
                  currentAction: "Current action",
                }[item.key]
              }{" "}
              {item.direction === "asc" ? "↑" : "↓"} ×
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
