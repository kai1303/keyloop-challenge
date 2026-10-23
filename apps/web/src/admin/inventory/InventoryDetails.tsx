import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  PopoverHeader,
  PopoverTitle,
} from "@keyloop-interview/ui/components/popover";
import { Separator } from "@keyloop-interview/ui/components/separator";
import { money, timestamp, type Vehicle } from "./inventory-model";

export function InventoryDetails({
  vehicle,
  onClose,
  onAction,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onAction: (vehicle: Vehicle, trigger: HTMLElement) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="admin-details">
      <m.div
        key={vehicle.id}
        initial={reduceMotion ? false : { opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      >
        <PopoverHeader className="flex-row items-start justify-between gap-3">
          <PopoverTitle className="font-heading text-xl font-semibold">
            {vehicle.registration}
          </PopoverTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close vehicle details"
            onClick={onClose}
          >
            ×
          </Button>
        </PopoverHeader>
        <Separator className="mt-5" />
        <section className="admin-detail-section">
          <h3>Vehicle & stock</h3>
          <dl>
            <div>
              <dt>Vehicle</dt>
              <dd>
                {vehicle.make} {vehicle.model} · {vehicle.modelYear}
              </dd>
            </div>
            <div>
              <dt>Price · GBP</dt>
              <dd>{money(vehicle.pricePence)}</dd>
            </div>
            <div>
              <dt>Stocked on</dt>
              <dd>{vehicle.stockedOn}</dd>
            </div>
            <div>
              <dt>Days in inventory</dt>
              <dd>
                {vehicle.daysInStock}
                {vehicle.aging ? " · Aging stock" : ""}
              </dd>
            </div>
          </dl>
        </section>
        <Separator className="mt-5" />
        <section className="admin-detail-section">
          <h3>Current action</h3>
          <dl>
            <div>
              <dt>Action</dt>
              <dd>
                {vehicle.currentAction ??
                  (vehicle.aging ? "Needs action" : "No action required")}
              </dd>
            </div>
            <div>
              <dt>Note</dt>
              <dd className="whitespace-pre-wrap">
                {vehicle.note ?? "No note recorded."}
              </dd>
            </div>
            {vehicle.actionUpdatedAt && (
              <div>
                <dt>Last updated · dealership local</dt>
                <dd>{timestamp(vehicle.actionUpdatedAt)}</dd>
              </div>
            )}
          </dl>
        </section>
        {vehicle.aging && (
          <Button
            className="mt-5 bg-[image:var(--kl-gradient-operate)] hover:opacity-90"
            onClick={(event) => onAction(vehicle, event.currentTarget)}
          >
            {vehicle.currentAction ? "Edit action" : "Log action"}
          </Button>
        )}
      </m.div>
    </div>
  );
}
