import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Gitbacker badge — full-pill, subtle tinted variants that use --primary,
 * --ok, --warn, --err from globals.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap transition-[color,background,border-color] border focus-visible:ring-2 focus-visible:ring-ring/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-[color-mix(in_oklch,var(--primary)_18%,var(--bg-2))] text-[color-mix(in_oklch,var(--primary)_90%,var(--foreground))] border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]",
        secondary:
          "bg-[var(--bg-2)] text-muted-foreground border-border",
        destructive:
          "bg-[color-mix(in_oklch,var(--err)_16%,var(--bg-2))] text-[color-mix(in_oklch,var(--err)_90%,var(--foreground))] border-[color-mix(in_oklch,var(--err)_30%,var(--border))]",
        success:
          "bg-[color-mix(in_oklch,var(--ok)_16%,var(--bg-2))] text-[color-mix(in_oklch,var(--ok)_90%,var(--foreground))] border-[color-mix(in_oklch,var(--ok)_30%,var(--border))]",
        warning:
          "bg-[color-mix(in_oklch,var(--warn)_16%,var(--bg-2))] text-[color-mix(in_oklch,var(--warn)_95%,var(--foreground))] border-[color-mix(in_oklch,var(--warn)_30%,var(--border))]",
        outline:
          "border-border text-foreground bg-transparent [a&]:hover:bg-[var(--bg-2)]",
        ghost:
          "border-transparent text-muted-foreground [a&]:hover:bg-[var(--bg-2)] [a&]:hover:text-foreground",
        link:
          "text-primary underline-offset-4 border-transparent [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
