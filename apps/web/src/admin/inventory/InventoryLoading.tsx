import { Skeleton } from "@keyloop-interview/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@keyloop-interview/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keyloop-interview/ui/components/table";
import { DEALER_TIMEZONE } from "../dealer-date";
import "./inventory.css";

export function InventoryLoading({
  includeHeader = false,
}: {
  includeHeader?: boolean;
}) {
  return (
    <>
      {includeHeader && (
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">SUPPLY / INVENTORY</p>
            <h1>Intelligent Inventory</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One dealership · {DEALER_TIMEZONE}
            </p>
          </div>
        </header>
      )}
      <section
        className="inventory-loading"
        role="status"
        aria-label="Loading inventory"
        aria-busy="true"
      >
        <span className="sr-only">Loading inventory…</span>
        <div aria-hidden="true">
          <div className="admin-metrics">
            {[
              ["Total vehicles", "All dealership stock"],
              ["Aging stock", "More than 90 days in inventory"],
              ["Needs action", "Aging vehicles with no saved action"],
            ].map(([label, description]) => (
              <div key={label}>
                <Card className="h-full gap-2 py-4">
                  <CardHeader className="gap-2 px-4">
                    <CardDescription className="text-foreground font-medium">
                      {label}
                    </CardDescription>
                    <CardTitle className="font-heading text-[28px] tabular-nums">
                      <Skeleton className="h-[1.5em] w-12" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 text-xs text-muted-foreground">
                    {description}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
          <Card className="admin-board gap-0 py-0">
            <CardContent className="space-y-6 p-4 sm:p-6">
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-heading font-semibold">Vehicle inventory</h2>
                  <Skeleton className="h-8 w-[120px]" />
                </div>
                <Table className="inventory-table">
                  <TableHeader>
                    <TableRow>
                      {[
                        "Vehicle",
                        "Registration",
                        "Price",
                        "Days in stock",
                        "Current action",
                        "Manage",
                      ].map((label) => (
                        <TableHead key={label} className="h-10">
                          {label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 6 }, (_, index) => (
                      <TableRow key={index} className="h-[60px]">
                        <TableCell>
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="mt-2 h-2 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="mt-2 h-4 w-20 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-8 w-24" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
          <div className="mt-4 min-h-10">
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      </section>
    </>
  );
}
