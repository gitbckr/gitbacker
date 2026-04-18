import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[96px] w-full max-w-full rounded-[10px] border border-foreground/10 bg-[var(--input)] px-3.5 py-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] [overflow-wrap:anywhere]",
        "transition-[border-color,box-shadow,background-color] outline-none",
        "placeholder:text-muted-foreground/60",
        "hover:border-foreground/15 hover:bg-foreground/[0.045]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--mint)]/60 focus-visible:ring-2 focus-visible:ring-[var(--mint)]/20 focus-visible:bg-foreground/[0.05]",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_oklch,var(--destructive)_30%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
