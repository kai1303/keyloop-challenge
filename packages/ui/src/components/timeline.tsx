import type { ComponentProps } from "react";
import { cn } from "@keyloop-interview/ui/lib/utils";

function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      data-slot="timeline"
      role="list"
      className={cn("list-none", className)}
      {...props}
    />
  );
}

function TimelineItem({ className, children, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="timeline-item"
      className={cn(
        "relative pb-6 pl-6 before:absolute before:top-2 before:bottom-0 before:left-1 before:border-l before:border-border last:pb-0 last:before:hidden",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute top-1.5 left-0 size-2.5 rounded-full border-2 border-primary bg-card"
      />
      {children}
    </li>
  );
}

export { Timeline, TimelineItem };
