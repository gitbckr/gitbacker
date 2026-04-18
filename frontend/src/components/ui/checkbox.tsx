"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-[18px] shrink-0 rounded-[5px] border border-foreground/15 bg-foreground/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all outline-none",
        "hover:border-foreground/25 hover:bg-foreground/[0.06]",
        "focus-visible:border-[var(--mint)]/60 focus-visible:ring-[3px] focus-visible:ring-[var(--mint)]/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "data-[state=checked]:border-[var(--mint)] data-[state=checked]:bg-[var(--mint)] data-[state=checked]:text-[#0A1A12] data-[state=checked]:shadow-[0_0_0_1px_var(--mint),0_4px_12px_-2px_color-mix(in_oklab,var(--mint)_40%,transparent)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon className="size-3.5 stroke-[3]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
