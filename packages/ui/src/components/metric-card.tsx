import type { ComponentProps, ReactNode } from "react"
import { cn } from "@keyloop-interview/ui/lib/utils"

function MetricCard({ label, value, description, className, ...props }:
  ComponentProps<"dl"> & { label: string; value: ReactNode; description?: string }) {
  return (
    <dl className={cn("rounded-xl border bg-card p-6 text-card-foreground", className)} {...props}>
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="mt-2 font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {description && <dd className="mt-2 text-sm opacity-80">{description}</dd>}
    </dl>
  )
}

export { MetricCard }
