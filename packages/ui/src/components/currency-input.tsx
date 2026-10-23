import type { ComponentProps } from "react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@keyloop-interview/ui/components/input-group"
import { cn } from "@keyloop-interview/ui/lib/utils"

function CurrencyInput({ currency, className, disabled, ...props }:
  Omit<ComponentProps<"input">, "type"> & { currency: string }) {
  return (
    <InputGroup data-disabled={disabled}>
      <InputGroupAddon aria-hidden="true">{currency}</InputGroupAddon>
      <InputGroupInput type="number" inputMode="decimal" min={0} step="0.01"
        disabled={disabled} className={cn("text-right tabular-nums", className)} {...props} />
    </InputGroup>
  )
}

export { CurrencyInput }
