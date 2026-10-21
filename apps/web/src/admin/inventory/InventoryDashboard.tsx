import { useEffect, useRef, useState } from "react";
import { Badge } from "@keyloop-interview/ui/components/badge";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@keyloop-interview/ui/components/card";
import { AdminLayout } from "../AdminLayout";
import { AdminSelect } from "../AdminSelect";
import { DEALER_TIMEZONE } from "../dealer-date";
import { InventoryActionDialog } from "./InventoryActionDialog";
import { InventoryTable } from "./InventoryTable";
import {
  AGE_OPTIONS,
  filterVehicles,
  summary,
  timestamp,
  type Filters,
  type Vehicle,
} from "./inventory-model";
import { useInventory } from "./useInventory";
import "./inventory.css";

const EMPTY_FILTERS: Filters = { make: "all", model: "all", age: "all" };
export function InventoryDashboard() {
  const inventory = useInventory();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const vehicles = inventory.data?.vehicles ?? [];
  const visible = filterVehicles(vehicles, filters);
  const counts = summary(vehicles);
  const makes = [...new Set(vehicles.map((vehicle) => vehicle.make))].sort();
  const models = [
    ...new Set(
      vehicles
        .filter(
          (vehicle) => filters.make === "all" || vehicle.make === filters.make,
        )
        .map((vehicle) => vehicle.model),
    ),
  ].sort();
  const filtered =
    filters.make !== "all" || filters.model !== "all" || filters.age !== "all";
  useEffect(() => {
    const previous = document.title;
    document.title = "Intelligent Inventory · Keyloop";
    return () => {
      document.title = previous;
    };
  }, []);
  function openAction(vehicle: Vehicle, element: HTMLElement) {
    trigger.current = element;
    setEditing(vehicle);
  }
  function restoreFocus() {
    (trigger.current?.isConnected ? trigger.current : heading.current)?.focus();
  }
  return (
    <>
      <AdminLayout activePage="inventory">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">SUPPLY / INVENTORY</p>
            <h1 ref={heading} tabIndex={-1}>
              Intelligent Inventory
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One dealership · {DEALER_TIMEZONE}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">
              {inventory.stale && inventory.connection === "Live"
                ? "Data stale"
                : inventory.connection}
            </Badge>
            <Button
              variant="outline"
              onClick={inventory.refresh}
              disabled={inventory.loading}
            >
              Refresh inventory
            </Button>
          </div>
        </header>
        {inventory.error && (
          <div role="alert" className="inventory-warning">
            <p>{inventory.error}</p>
            <Button variant="outline" onClick={inventory.refresh}>
              Retry
            </Button>
          </div>
        )}
        {inventory.loading && !inventory.data && (
          <p role="status">Loading inventory…</p>
        )}
        {inventory.data && (
          <>
            {inventory.stale && (
              <p className="inventory-warning" role="status">
                Inventory may be out of date. Waiting for a fresh snapshot and
                live connection.
              </p>
            )}
            <section
              className="admin-metrics"
              aria-label="Dealership inventory summary"
            >
              {[
                {
                  label: "Total vehicles",
                  value: counts.total,
                  description: "All dealership stock",
                },
                {
                  label: "Aging stock",
                  value: counts.aging,
                  description: "More than 90 days in inventory",
                },
                {
                  label: "Needs action",
                  value: counts.needsAction,
                  description: "Aging vehicles with no saved action",
                },
              ].map((metric) => (
                <div key={metric.label}>
                  <Card className="h-full gap-2 py-4">
                    <CardHeader className="gap-2 px-4">
                      <CardDescription className="text-foreground font-medium">
                        {metric.label}
                      </CardDescription>
                      <CardTitle className="font-heading text-[28px] tabular-nums">
                        {metric.value}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 text-xs text-muted-foreground">
                      {metric.description}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </section>
            <Card className="admin-board gap-0 py-0">
              <CardContent className="space-y-6 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-heading font-semibold">
                    Vehicle inventory
                  </h2>
                  <Button
                    variant={filters.age === "aging" ? "secondary" : "outline"}
                    onClick={() =>
                      setFilters((current) => ({ ...current, age: "aging" }))
                    }
                  >
                    Show aging stock ({counts.aging})
                  </Button>
                </div>
                <div className="inventory-filters">
                  <AdminSelect
                    label="Make"
                    value={filters.make}
                    options={[
                      { id: "all", name: "All makes" },
                      ...makes.map((value) => ({ id: value, name: value })),
                    ]}
                    onChange={(make) =>
                      setFilters((current) => ({
                        ...current,
                        make,
                        model:
                          current.model !== "all" &&
                          vehicles.some(
                            (vehicle) =>
                              (make === "all" || vehicle.make === make) &&
                              vehicle.model === current.model,
                          )
                            ? current.model
                            : "all",
                      }))
                    }
                  />
                  <AdminSelect
                    label="Model"
                    value={filters.model}
                    options={[
                      { id: "all", name: "All models" },
                      ...models.map((value) => ({ id: value, name: value })),
                    ]}
                    onChange={(model) =>
                      setFilters((current) => ({ ...current, model }))
                    }
                  />
                  <AdminSelect
                    label="Days in stock"
                    value={filters.age}
                    options={AGE_OPTIONS}
                    onChange={(age) =>
                      setFilters((current) => ({
                        ...current,
                        age: age as Filters["age"],
                      }))
                    }
                  />
                </div>
                <div className="admin-workspace">
                  <section className="min-w-0" aria-label="Inventory results">
                    {visible.length ? (
                      <InventoryTable
                        vehicles={visible}
                        selectedId={selectedId}
                        onSelect={(vehicle) =>
                          setSelectedId(vehicle?.id ?? null)
                        }
                        onAction={openAction}
                        modalOpen={editing !== null}
                      />
                    ) : (
                      <div className="admin-empty">
                        <h3>
                          {vehicles.length
                            ? "No vehicles match your filters."
                            : "No vehicles in inventory."}
                        </h3>
                        <p>
                          {vehicles.length
                            ? "Change the make, model, or stock age."
                            : "No vehicle records have been loaded for this dealership."}
                        </p>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {visible.length} of {vehicles.length} vehicles shown
                        {filtered ? " · filtered" : ""}
                      </span>
                      {filtered && (
                        <Button
                          variant="link"
                          size="xs"
                          onClick={() => setFilters(EMPTY_FILTERS)}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </section>
                </div>
              </CardContent>
            </Card>
            <p className="mt-4 text-xs text-muted-foreground">
              {inventory.lastUpdated
                ? "Last refreshed: " + timestamp(inventory.lastUpdated)
                : "Waiting for inventory"}{" "}
              · Stock age uses the dealership date.
            </p>
          </>
        )}
        <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
          {notice}
        </p>
        <footer className="admin-page-footer">
          <span>Keyloop · Supply</span>
          <span>Fictional inventory. Actions persist in local Supabase.</span>
        </footer>
      </AdminLayout>
      {editing && (
        <InventoryActionDialog
          key={editing.id}
          vehicle={editing}
          onClose={() => setEditing(null)}
          restoreFocus={restoreFocus}
          onSaved={(saved) => {
            setNotice(saved.registration + " action saved.");
            setEditing(null);
            inventory.refresh();
          }}
        />
      )}
    </>
  );
}
