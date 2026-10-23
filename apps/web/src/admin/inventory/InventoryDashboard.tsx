import { Skeleton } from "@keyloop-interview/ui/components/skeleton";
import {
  DEFAULT_INVENTORY_QUERY,
  type InventoryQuery,
} from "./inventory-query";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@keyloop-interview/ui/components/card";
import { DEALER_TIMEZONE } from "../dealer-date";
import { InventoryActionDialog } from "./InventoryActionDialog";
import { InventoryLoading } from "./InventoryLoading";
import { InventoryTable } from "./InventoryTable";
import { timestamp, type Vehicle } from "./inventory-model";
import { useInventory } from "./useInventory";
import "./inventory.css";

const metricVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};
export function InventoryDashboard() {
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? false : { opacity: 0, y: 8 };
  const transition = {
    duration: reduceMotion ? 0 : 0.24,
    ease: "easeOut" as const,
  };
  const [query, setQuery] = useState<InventoryQuery>(DEFAULT_INVENTORY_QUERY);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const inventory = useInventory(query);
  function changeQuery(next: InventoryQuery) {
    setQuery({ ...next, after: null });
    setHistory([]);
    setSelectedId(null);
  }
  const startedWithData = useRef(inventory.data !== null).current;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const vehicles = inventory.data?.vehicles ?? [];
  const counts = inventory.metadata?.summary;
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
      <m.header
        className="admin-header"
        initial={inventory.loading && !inventory.data ? false : entrance}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <div>
          <p className="admin-eyebrow">SUPPLY / INVENTORY</p>
          <h1 ref={heading} tabIndex={-1}>
            Intelligent Inventory
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One dealership · {DEALER_TIMEZONE}
          </p>
        </div>
      </m.header>
      {inventory.error && (
        <div role="alert" className="inventory-warning">
          <p>{inventory.error}</p>
          <Button variant="outline" onClick={inventory.refresh}>
            Retry
          </Button>
        </div>
      )}
      {inventory.loading && !inventory.data && <InventoryLoading />}
      {inventory.data && (
        <>
          <m.section
            className="admin-metrics"
            aria-label="Dealership inventory summary"
            initial={reduceMotion || !startedWithData ? false : "hidden"}
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: reduceMotion ? 0 : 0.06 },
              },
            }}
          >
            {[
              {
                label: "Total vehicles",
                value: counts?.total,
                description: "All dealership stock",
              },
              {
                label: "Aging stock",
                value: counts?.aging,
                description: "More than 90 days in inventory",
              },
              {
                label: "Needs action",
                value: counts?.needsAction,
                description: "Aging vehicles with no saved action",
              },
            ].map((metric) => (
              <m.div variants={metricVariants} key={metric.label}>
                <Card className="h-full gap-2 py-4">
                  <CardHeader className="gap-2 px-4">
                    <CardDescription className="text-foreground font-medium">
                      {metric.label}
                    </CardDescription>
                    <CardTitle className="font-heading text-[28px] tabular-nums">
                      {metric.value ?? <Skeleton className="h-[1.5em] w-12" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 text-xs text-muted-foreground">
                    {metric.description}
                  </CardContent>
                </Card>
              </m.div>
            ))}
          </m.section>
          <m.div
            initial={startedWithData ? entrance : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transition, delay: reduceMotion ? 0 : 0.08 }}
          >
            <Card className="admin-board gap-0 py-0">
              <CardContent className="space-y-6 p-4 sm:p-6">
                <div>
                  <section className="min-w-0" aria-label="Inventory results">
                    <InventoryTable
                      vehicles={vehicles}
                      query={query}
                      onQueryChange={changeQuery}
                      options={inventory.metadata?.options ?? {}}
                      total={counts?.total ?? null}
                      updating={inventory.updating}
                      placeholder={inventory.placeholder}
                      page={history.length + 1}
                      hasNext={!!inventory.data.nextCursor}
                      onNext={() => {
                        if (inventory.data?.nextCursor) {
                          setHistory([...history, query.after]);
                          setQuery({
                            ...query,
                            after: inventory.data.nextCursor,
                          });
                          setSelectedId(null);
                        }
                      }}
                      onPrevious={() => {
                        if (history.length) {
                          setQuery({ ...query, after: history.at(-1)! });
                          setHistory(history.slice(0, -1));
                          setSelectedId(null);
                        }
                      }}
                      selectedId={selectedId}
                      onSelect={(vehicle) => setSelectedId(vehicle?.id ?? null)}
                      onAction={openAction}
                      modalOpen={editing !== null}
                    />
                  </section>
                </div>
              </CardContent>
            </Card>
          </m.div>
          <p
            role="status"
            aria-label="Inventory freshness"
            className="mt-4 min-h-10 text-xs text-muted-foreground"
          >
            {inventory.stale
              ? inventory.connection === "Connecting"
                ? "Updating inventory…"
                : "Inventory may be out of date. Waiting for a fresh snapshot and live connection."
              : inventory.lastUpdated
                ? "Last refreshed: " + timestamp(inventory.lastUpdated)
                : "Waiting for inventory"}
            <span className="block">Stock age uses the dealership date.</span>
          </p>
        </>
      )}
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
        <m.span
          key={notice}
          className="inline-block"
          initial={entrance}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
        >
          {notice}
        </m.span>
      </p>
      <footer className="admin-page-footer">
        <span>Keyloop · Supply</span>
        <span>Fictional inventory. Actions persist in local Supabase.</span>
      </footer>
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
