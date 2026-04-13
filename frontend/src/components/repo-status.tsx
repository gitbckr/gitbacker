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
  className: string;
  animate?: boolean;
};

const statusConfig: Record<string, StatusConfig> = {
  verifying: {
    icon: Loader2,
    label: "Verifying",
    className: "text-blue-500",
    animate: true,
  },
  scheduled: {
    icon: Clock,
    label: "Scheduled",
    className: "text-slate-500",
  },
  running: {
    icon: Loader2,
    label: "Running",
    className: "text-amber-500",
    animate: true,
  },
  backed_up: {
    icon: CheckCircle2,
    label: "Backed up",
    className: "text-emerald-600",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    className: "text-red-500",
  },
  access_error: {
    icon: AlertCircle,
    label: "Access error",
    className: "text-red-500",
  },
  unreachable: {
    icon: WifiOff,
    label: "Unreachable",
    className: "text-red-400",
  },
};

const fallback: StatusConfig = {
  icon: Clock,
  label: "Unknown",
  className: "text-slate-400",
};

export function RepoStatusBadge({
  status,
  reason,
}: {
  status: string;
  reason?: string | null;
}) {
  const config = statusConfig[status] ?? fallback;
  const Icon = config.icon;

  const badge = (
    <span className={`inline-flex items-center gap-1.5 ${config.className}`}>
      <Icon
        className={`h-4 w-4 ${config.animate ? "animate-spin" : ""}`}
        strokeWidth={2}
      />
      <span className="text-sm font-medium">{config.label}</span>
    </span>
  );

  if (reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs">{reason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
