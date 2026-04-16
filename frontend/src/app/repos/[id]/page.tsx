"use client";

import { Fragment, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Play,
  Timer,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  listBackupJobs,
  listRestoreJobs,
  type BackupJob,
  type RestoreJob,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const jobStatusConfig: Record<
  string,
  { icon: React.ElementType; label: string; className: string; animate?: boolean }
> = {
  pending: { icon: Clock, label: "Pending", className: "text-slate-500" },
  running: { icon: Loader2, label: "Running", className: "text-amber-500", animate: true },
  succeeded: { icon: CheckCircle2, label: "Succeeded", className: "text-emerald-600" },
  failed: { icon: XCircle, label: "Failed", className: "text-red-500" },
};

function JobStatusBadge({ status }: { status: string }) {
  const config = jobStatusConfig[status] ?? jobStatusConfig.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${config.className}`}>
      <Icon className={`h-4 w-4 ${config.animate ? "animate-spin" : ""}`} strokeWidth={2} />
      <span className="text-sm font-medium">{config.label}</span>
    </span>
  );
}

type UnifiedJob = {
  id: string;
  kind: "backup" | "restore";
  status: string;
  trigger_type?: string;
  restore_target_url?: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  output_log: string | null;
  backup_size_bytes?: number | null;
  created_at: string;
};

function unifyJobs(backups: BackupJob[], restores: RestoreJob[]): UnifiedJob[] {
  const unified: UnifiedJob[] = [
    ...backups.map((j) => ({
      id: j.id,
      kind: "backup" as const,
      status: j.status,
      trigger_type: j.trigger_type,
      started_at: j.started_at,
      finished_at: j.finished_at,
      duration_seconds: j.duration_seconds,
      output_log: j.output_log,
      backup_size_bytes: j.backup_size_bytes,
      created_at: j.created_at,
    })),
    ...restores.map((j) => ({
      id: j.id,
      kind: "restore" as const,
      status: j.status,
      restore_target_url: j.restore_target_url,
      started_at: j.started_at,
      finished_at: j.finished_at,
      duration_seconds: j.duration_seconds,
      output_log: j.output_log,
      created_at: j.created_at,
    })),
  ];
  unified.sort((a, b) => {
    const aTime = a.started_at ?? a.created_at;
    const bTime = b.started_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
  return unified;
}

export default function RepoDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const { data: backupJobs = [], isLoading: loadingBackups, isError: errorBackups } = useQuery({
    queryKey: ["backup-jobs", params.id],
    queryFn: () => listBackupJobs(token!, params.id),
    enabled: !!token && !!params.id,
    refetchInterval: 5000,
  });

  const { data: restoreJobs = [], isLoading: loadingRestores, isError: errorRestores } = useQuery({
    queryKey: ["restore-jobs", params.id],
    queryFn: () => listRestoreJobs(token!, params.id),
    enabled: !!token && !!params.id,
    refetchInterval: 5000,
  });

  const jobs = useMemo(
    () => unifyJobs(backupJobs, restoreJobs),
    [backupJobs, restoreJobs],
  );

  const isLoading = loadingBackups || loadingRestores;
  const isError = errorBackups || errorRestores;

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Job History</h1>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load job history. Please try again.</p>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground">
            No jobs yet. Trigger a backup from the Repos page.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <Fragment key={job.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      setExpandedJob(expandedJob === job.id ? null : job.id)
                    }
                  >
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {job.kind === "backup" ? (
                          <Play className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="capitalize">{job.kind}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {job.kind === "backup"
                          ? job.trigger_type ?? "—"
                          : job.restore_target_url
                            ? job.restore_target_url.split(/[/:]/).pop()?.replace(".git", "") ?? "—"
                            : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {job.started_at
                        ? formatDateTime(job.started_at)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.duration_seconds != null
                        ? formatDuration(job.duration_seconds)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.backup_size_bytes != null
                        ? formatBytes(job.backup_size_bytes)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.output_log ? (expandedJob === job.id ? "▲" : "▼") : ""}
                    </TableCell>
                  </TableRow>
                  {expandedJob === job.id && job.output_log && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <pre className="whitespace-pre-wrap bg-muted p-4 text-xs font-mono max-h-64 overflow-auto">
                          {job.output_log}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
