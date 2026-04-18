import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Gitbacker input — landing-page signature.
 *
 * • 10px radius (softer than pill but not sharp)
 * • uses --input surface; focus brings mint ring, not inner shadow
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[10px] border border-border bg-[var(--input)] px-3.5 py-2 text-sm",
        "transition-[border-color,box-shadow] outline-none",
        "selection:bg-primary selection:text-primary-foreground",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/70",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_35%,transparent)]",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_oklch,var(--destructive)_30%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
