import * as React from "react"
import { cn } from "@keyloop-interview/ui/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"

function Checkbox({
  className,
  checked,
  defaultChecked = false,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
  const state = checked ?? internalChecked
  const reduceMotion = useReducedMotion()

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={state}
      defaultChecked={defaultChecked}
      onCheckedChange={value => {
        if (checked === undefined) setInternalChecked(value)
        onCheckedChange?.(value)
      }}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        data-slot="checkbox-indicator"
        className="relative grid size-3.5 place-items-center text-current"
      >
        <AnimatePresence initial={false}>
          {state !== false && (
            <m.span
              key={state === "indeterminate" ? "mixed" : "checked"}
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center"
              initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.6 }}
              transition={{ duration: reduceMotion ? 0 : 0.12, ease: "easeOut" }}
            >
              {state === "indeterminate" ? <MinusIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
            </m.span>
          )}
        </AnimatePresence>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
