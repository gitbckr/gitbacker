"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Play,
  Timer,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { listBackupJobs } from "@/lib/api";
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

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

export default function RepoDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();

  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ["backup-jobs", params.id],
    queryFn: () => listBackupJobs(token!, params.id),
    enabled: !!token && !!params.id,
    refetchInterval: 5000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Backup History</h1>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load backup history. Please try again.</p>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground">
            No backup jobs yet. Trigger a backup from the Repos page.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      {job.trigger_type === "manual" ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Timer className="h-3.5 w-3.5" />
                      )}
                      {job.trigger_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.started_at
                      ? new Date(job.started_at).toLocaleString()
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {jobs.some((j) => j.output_log) && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Latest Log</h2>
            {jobs
              .filter((j) => j.output_log)
              .slice(0, 1)
              .map((job) => (
                <Card key={job.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      <span className="text-muted-foreground font-normal">
                        Job {job.id.slice(0, 8)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs font-mono">
                      {job.output_log}
                    </pre>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
