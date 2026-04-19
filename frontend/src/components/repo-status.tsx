"use client";

import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type StatusConfig = {
  icon: React.ElementType;
  label: string;
  /** CSS color token used for icon + text + glow */
  color: string;
  animate?: boolean;
};

const statusConfig: Record<string, StatusConfig> = {
  verifying: {
    icon: Loader2,
    label: "Verifying",
    color: "var(--info)",
    animate: true,
  },
  scheduled: {
    icon: Clock,
    label: "Scheduled",
    color: "var(--muted-foreground)",
  },
  running: {
    icon: Loader2,
    label: "Running",
    color: "var(--warn)",
    animate: true,
  },
  backed_up: {
    icon: CheckCircle2,
    label: "Backed up",
    color: "var(--mint)",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "var(--err)",
  },
  access_error: {
    icon: AlertCircle,
    label: "Access error",
    color: "var(--err)",
  },
  unreachable: {
    icon: WifiOff,
    label: "Unreachable",
    color: "var(--err)",
  },
};

const fallback: StatusConfig = {
  icon: Clock,
  label: "Unknown",
  color: "var(--muted-foreground)",
};

type Variant = "inline" | "pill" | "dot";

export function RepoStatusBadge({
  status,
  reason,
  variant = "inline",
}: {
  status: string;
  reason?: string | null;
  variant?: Variant;
}) {
  const config = statusConfig[status] ?? fallback;
  const Icon = config.icon;

  let badge: React.ReactNode;

  if (variant === "dot") {
    badge = (
      <span className="inline-flex items-center gap-2" style={{ color: config.color }}>
        <span
          className="relative inline-flex size-2 rounded-full"
          style={{
            background: config.color,
            boxShadow: `0 0 0 3px color-mix(in oklch, ${config.color} 15%, transparent)`,
          }}
        >
          {config.animate && (
            <span
              className="absolute inset-0 animate-ping rounded-full"
              style={{ background: config.color, opacity: 0.5 }}
            />
          )}
        </span>
        <span className="text-[13px] font-medium text-foreground">
          {config.label}
        </span>
      </span>
    );
  } else if (variant === "pill") {
    badge = (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium tabular-nums"
        style={{
          color: config.color,
          borderColor: `color-mix(in oklch, ${config.color} 35%, var(--border))`,
          background: `color-mix(in oklch, ${config.color} 8%, transparent)`,
        }}
      >
        <Icon
          className={`size-3 ${config.animate ? "animate-spin" : ""}`}
          strokeWidth={2.25}
        />
        {config.label}
      </span>
    );
  } else {
    badge = (
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: config.color }}
      >
        <Icon
          className={`size-4 ${config.animate ? "animate-spin" : ""}`}
          strokeWidth={2}
        />
        <span className="text-[13px] font-medium">{config.label}</span>
      </span>
    );
  }

  if (reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs leading-relaxed">{reason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
