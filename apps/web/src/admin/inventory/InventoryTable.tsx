import { Badge } from "@keyloop-interview/ui/components/badge";
import { Button } from "@keyloop-interview/ui/components/button";
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
import { money, type Vehicle } from "./inventory-model";

export function InventoryTable({
  vehicles,
  selectedId,
  onSelect,
  onAction,
  modalOpen,
}: {
  vehicles: Vehicle[];
  selectedId: string | null;
  onSelect: (vehicle: Vehicle | null) => void;
  modalOpen: boolean;
  onAction: (vehicle: Vehicle, trigger: HTMLElement) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Table aria-label="Vehicle inventory">
      <TableHeader>
        <TableRow>
          <TableHead>Vehicle</TableHead>
          <TableHead>Registration</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Days in stock</TableHead>
          <TableHead>Current action</TableHead>
          <TableHead>Manage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.map((vehicle) => (
          <TableRow
            key={vehicle.id}
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
                  variant="outline"
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
      </TableBody>
    </Table>
  );
}
