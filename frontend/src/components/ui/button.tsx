import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Gitbacker button — landing-page signature.
 *
 * • rounded-full by default (pill)
 * • primary = mint with soft glow; hover lifts 1px
 * • ghost / outline use bg-2 / border + background surfaces
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] text-sm font-medium whitespace-nowrap transition-[background,color,box-shadow,border-color] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary shadow-[0_6px_18px_-10px_color-mix(in_oklch,var(--primary)_55%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_92%,white)] hover:shadow-[0_12px_28px_-10px_color-mix(in_oklch,var(--primary)_70%,transparent)]",
        destructive:
          "bg-destructive text-white border border-destructive shadow-[0_6px_18px_-10px_color-mix(in_oklch,var(--destructive)_50%,transparent)] hover:bg-[color-mix(in_oklch,var(--destructive)_92%,white)] hover:shadow-[0_12px_28px_-10px_color-mix(in_oklch,var(--destructive)_65%,transparent)] focus-visible:ring-destructive/40",
        outline:
          "bg-[var(--bg-2)] text-foreground border border-border hover:border-[color-mix(in_oklch,var(--foreground)_30%,var(--border))] hover:bg-[var(--bg-3)]",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent hover:bg-[var(--bg-3)]",
        ghost:
          "bg-transparent text-muted-foreground hover:text-foreground hover:bg-[var(--bg-2)] border border-transparent",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto rounded-none",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        xs: "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 has-[>svg]:px-3 text-[13px]",
        lg: "h-11 px-7 text-[15px] has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
