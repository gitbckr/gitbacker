"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  HardDrive,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  listRepositories,
  listDestinations,
  getBackupActivity,
  type Destination,
} from "@/lib/api";
import { BackupHeatmap } from "@/components/backup-heatmap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function storageBarColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct > 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function StorageOverview({ destinations }: { destinations: Destination[] }) {
  const totalUsed = destinations.reduce((s, d) => s + d.used_bytes, 0);
  const withCapacity = destinations.filter(
    (d) => d.available_bytes != null && d.available_bytes > 0,
  );
  const totalCapacity =
    withCapacity.length > 0
      ? withCapacity.reduce(
          (s, d) => s + d.used_bytes + (d.available_bytes ?? 0),
          0,
        )
      : null;
  const overallPct =
    totalCapacity != null && totalCapacity > 0
      ? (totalUsed / totalCapacity) * 100
      : null;

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Storage Usage
        </CardTitle>
        <Link
          href="/destinations"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-4">
        {/* Overall summary */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xl font-bold">
              {formatBytes(totalUsed)}
            </span>
            {totalCapacity != null && (
              <span className="text-sm text-muted-foreground">
                of {formatBytes(totalCapacity)}
              </span>
            )}
          </div>
          {overallPct != null && (
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${storageBarColor(overallPct)}`}
                style={{ width: `${Math.min(overallPct, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Per-destination breakdown */}
        {destinations.length > 0 && (
          <div className="space-y-2.5 pt-1">
            {destinations.map((d) => {
              const cap =
                d.available_bytes != null
                  ? d.used_bytes + d.available_bytes
                  : null;
              const pct =
                cap != null && cap > 0
                  ? (d.used_bytes / cap) * 100
                  : null;
              return (
                <div key={d.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[60%]">
                      {d.alias}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatBytes(d.used_bytes)}
                      {cap != null && (
                        <span className="text-muted-foreground/60">
                          {" "}/ {formatBytes(cap)}
                        </span>
                      )}
                    </span>
                  </div>
                  {pct != null && (
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${storageBarColor(pct)}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {destinations.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No destinations configured.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { token } = useAuth();

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: () => listRepositories(token!),
    enabled: !!token,
  });

  const destinations = useQuery({
    queryKey: ["destinations"],
    queryFn: () => listDestinations(token!),
    enabled: !!token,
  });

  const activity = useQuery({
    queryKey: ["backup-activity"],
    queryFn: () => getBackupActivity(token!),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const repoData = repos.data ?? [];
  const totalRepos = repoData.length;
  const backedUp = repoData.filter((r) => r.status === "backed_up").length;
  const failed = repoData.filter(
    (r) => r.status === "failed" || r.status === "access_error",
  ).length;

  const stats = [
    {
      label: "Total Repos",
      value: totalRepos,
      icon: GitBranch,
      color: "text-foreground",
      iconColor: "text-slate-500",
      href: "/repos",
    },
    {
      label: "Backed Up",
      value: backedUp,
      icon: CheckCircle2,
      color: "text-emerald-600",
      iconColor: "text-emerald-500",
      href: "/repos",
    },
    {
      label: "Failed",
      value: failed,
      icon: XCircle,
      color: "text-red-600",
      iconColor: "text-red-500",
      href: "/repos",
    },
    {
      label: "Destinations",
      value: destinations.data?.length ?? 0,
      icon: HardDrive,
      color: "text-foreground",
      iconColor: "text-slate-500",
      href: "/destinations",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href}>
              <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full py-0 gap-0">
                <CardHeader className="flex flex-row items-center justify-between pt-4 px-5 pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
                </CardHeader>
                <CardContent className="pb-4 px-5">
                  <p className={`text-2xl font-bold ${stat.color}`}>
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2 py-0 gap-0">
            <CardHeader className="pt-4 px-5 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Backup Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden px-5 pb-4">
              <BackupHeatmap
                data={activity.data ?? []}
                isLoading={activity.isLoading}
              />
            </CardContent>
          </Card>

          <StorageOverview destinations={destinations.data ?? []} />
        </div>

        {(repos.isError || destinations.isError) && (
          <Card className="border-red-200 bg-red-50 py-0 gap-0">
            <CardContent className="flex items-center gap-3 py-3 px-5">
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-800">
                Failed to load dashboard data. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {failed > 0 && (
          <Card className="border-red-200 bg-red-50 py-0 gap-0">
            <CardContent className="flex items-center gap-3 py-3 px-5">
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-800">
                {failed} repo{failed > 1 ? "s" : ""} ha
                {failed > 1 ? "ve" : "s"} errors. Check the{" "}
                <Link href="/repos" className="font-medium underline">
                  Repos
                </Link>{" "}
                page for details.
              </p>
            </CardContent>
          </Card>
        )}

        {totalRepos === 0 && !repos.isLoading && (
          <Card className="py-0 gap-0">
            <CardContent className="py-3 px-5">
              <p className="text-sm text-muted-foreground">
                No repositories yet.{" "}
                <Link href="/repos" className="font-medium underline">
                  Add your first repo
                </Link>{" "}
                to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
