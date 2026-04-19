"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "next-themes"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--mint)]" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast !bg-popover/95 !border !border-foreground/10 !text-foreground !rounded-lg !shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] !backdrop-blur-xl !font-sans",
          description: "!text-muted-foreground !text-[12.5px]",
          actionButton:
            "!bg-[var(--mint)] !text-[#0A1A12] !font-medium !rounded-md",
          cancelButton: "!bg-foreground/[0.06] !text-foreground !rounded-md",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
