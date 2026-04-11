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
import { AppShell } from "@/components/app-shell";
import { listRepositories, listDestinations, getBackupActivity } from "@/lib/api";
import { BackupHeatmap } from "@/components/backup-heatmap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    },
    {
      label: "Backed Up",
      value: backedUp,
      icon: CheckCircle2,
      color: "text-emerald-600",
      iconColor: "text-emerald-500",
    },
    {
      label: "Failed",
      value: failed,
      icon: XCircle,
      color: "text-red-600",
      iconColor: "text-red-500",
    },
    {
      label: "Destinations",
      value: destinations.data?.length ?? 0,
      icon: HardDrive,
      color: "text-foreground",
      iconColor: "text-slate-500",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Backup Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BackupHeatmap
              data={activity.data ?? []}
              isLoading={activity.isLoading}
            />
          </CardContent>
        </Card>

        {(repos.isError || destinations.isError) && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-3 pt-6">
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-800">
                Failed to load dashboard data. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {failed > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-3 pt-6">
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
          <Card>
            <CardContent className="pt-6">
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
