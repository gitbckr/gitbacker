"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GitBranchIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  HardDriveIcon,
  ArrowRightIcon,
  PlusIcon,
  ActivityIcon,
  DatabaseIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  listRepositories,
  listDestinations,
  getBackupActivity,
  type Destination,
  type Repository,
} from "@/lib/api";
import { BackupHeatmap } from "@/components/backup-heatmap";
import { RepoStatusBadge } from "@/components/repo-status";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Hero({ userName }: { userName?: string }) {
  const now = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div>
        <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {now}
        </p>
        <h1 className="mt-1.5 font-serif text-[34px] leading-[1.05] tracking-[-0.01em]">
          {greeting()}
          {userName ? (
            <>
              ,{" "}
              <em className="not-italic text-[var(--mint)]">{userName}</em>
            </>
          ) : (
            <>.</>
          )}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="default">
          <Link href="/repos">
            <GitBranchIcon className="size-4" />
            View repositories
          </Link>
        </Button>
        <Button asChild size="default">
          <Link href="/repos?add=1">
            <PlusIcon className="size-4" />
            Add repository
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat cards                                                         */
/* ------------------------------------------------------------------ */

type StatProps = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ElementType;
  tone: "neutral" | "ok" | "warn" | "err";
  href: string;
};

function StatCard({ label, value, sub, icon: Icon, tone, href }: StatProps) {
  const toneColor =
    tone === "ok"
      ? "var(--mint)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "err"
          ? "var(--err)"
          : "var(--muted-foreground)";

  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between overflow-hidden rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)] p-5 transition-all hover:border-foreground/15 hover:bg-foreground/[0.03]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: `linear-gradient(to right, transparent, ${toneColor}, transparent)`,
        }}
      />
      <div className="flex items-start justify-between">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <span
          className="grid size-8 place-items-center rounded-lg border border-foreground/10 bg-foreground/[0.03]"
          style={{ color: toneColor }}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
      </div>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-[38px] font-semibold leading-none tracking-[-0.025em] text-foreground tabular-nums">
          {value}
        </span>
      </div>
      {sub && (
        <div className="mt-1.5 text-[12px] text-muted-foreground">{sub}</div>
      )}
      <span
        aria-hidden
        className="absolute right-5 bottom-5 translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
      >
        <ArrowRightIcon className="size-3.5" />
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/* ------------------------------------------------------------------ */

function storageTone(pct: number): { color: string; label: string } {
  if (pct > 90) return { color: "var(--err)", label: "Critical" };
  if (pct > 75) return { color: "var(--warn)", label: "High" };
  return { color: "var(--mint)", label: "Healthy" };
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

  const sorted = [...destinations].sort((a, b) => b.used_bytes - a.used_bytes);

  return (
    <section className="flex h-full flex-col rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)]">
      <header className="flex items-center justify-between border-b border-foreground/[0.05] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <HardDriveIcon className="size-4 text-muted-foreground" />
          <h3 className="text-[13px] font-medium">Storage</h3>
        </div>
        <Link
          href="/destinations"
          className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage →
        </Link>
      </header>

      <div className="flex-1 space-y-5 px-5 py-4">
        {/* Overall */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums">
              {formatBytes(totalUsed)}
            </span>
            {totalCapacity != null && (
              <span className="text-[12px] text-muted-foreground tabular-nums">
                of {formatBytes(totalCapacity)}
              </span>
            )}
          </div>
          {overallPct != null && (
            <>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(overallPct, 100)}%`,
                    background: storageTone(overallPct).color,
                    boxShadow: `0 0 12px -2px ${storageTone(overallPct).color}`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11.5px] tabular-nums">
                <span className="text-muted-foreground">
                  {overallPct.toFixed(1)}% used
                </span>
                <span
                  className="font-medium"
                  style={{ color: storageTone(overallPct).color }}
                >
                  {storageTone(overallPct).label}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Per-destination */}
        {sorted.length > 0 ? (
          <div className="space-y-3 border-t border-foreground/[0.05] pt-4">
            {sorted.slice(0, 4).map((d) => {
              const cap =
                d.available_bytes != null
                  ? d.used_bytes + d.available_bytes
                  : null;
              const pct =
                cap != null && cap > 0 ? (d.used_bytes / cap) * 100 : null;
              const tone = pct != null ? storageTone(pct) : null;
              return (
                <div key={d.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          background: tone?.color ?? "var(--muted-foreground)",
                        }}
                      />
                      <span className="truncate font-medium text-foreground/90">
                        {d.alias}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatBytes(d.used_bytes)}
                      {cap != null && (
                        <span className="text-muted-foreground/50">
                          {" / "}
                          {formatBytes(cap)}
                        </span>
                      )}
                    </span>
                  </div>
                  {pct != null && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: tone!.color,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border-t border-foreground/[0.05] pt-4 text-[12.5px] text-muted-foreground">
            No destinations configured yet.{" "}
            <Link
              href="/destinations"
              className="font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-[var(--mint)] hover:decoration-solid"
            >
              Add one
            </Link>
            .
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent repos                                                       */
/* ------------------------------------------------------------------ */

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 14 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function RecentRepos({ repos }: { repos: Repository[] }) {
  const recent = useMemo(() => {
    const copy = [...repos];
    copy.sort((a, b) => {
      // Failed first, then by last_backup_at desc
      const aFailed = a.status === "failed" || a.status === "access_error";
      const bFailed = b.status === "failed" || b.status === "access_error";
      if (aFailed !== bFailed) return aFailed ? -1 : 1;
      const aT = a.last_backup_at ? new Date(a.last_backup_at).getTime() : 0;
      const bT = b.last_backup_at ? new Date(b.last_backup_at).getTime() : 0;
      return bT - aT;
    });
    return copy.slice(0, 6);
  }, [repos]);

  return (
    <section className="flex h-full flex-col rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)]">
      <header className="flex items-center justify-between border-b border-foreground/[0.05] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="size-4 text-muted-foreground" />
          <h3 className="text-[13px] font-medium">Repositories</h3>
          <span className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-muted-foreground">
            {repos.length}
          </span>
        </div>
        <Link
          href="/repos"
          className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          View all →
        </Link>
      </header>

      {recent.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <DatabaseIcon className="size-6 text-muted-foreground/60" />
          <p className="text-[13px] text-muted-foreground">
            No repositories yet.
          </p>
          <Button asChild size="sm" className="mt-1">
            <Link href="/repos?add=1">
              <PlusIcon className="size-3.5" />
              Add your first repo
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-foreground/[0.04]">
          {recent.map((r) => (
            <li key={r.id}>
              <Link
                href={`/repos/${r.id}`}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-foreground/[0.025]"
              >
                <RepoStatusBadge
                  status={r.status}
                  reason={r.status_reason}
                  variant="dot"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {r.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {r.url.replace(/^https?:\/\//, "")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11.5px] text-muted-foreground tabular-nums">
                  {formatRelative(r.last_backup_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { token, user } = useAuth();

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
  const running = repoData.filter(
    (r) => r.status === "running" || r.status === "verifying",
  ).length;
  const failed = repoData.filter(
    (r) =>
      r.status === "failed" ||
      r.status === "access_error" ||
      r.status === "unreachable",
  ).length;

  const encryptedCount = repoData.filter((r) => r.encrypt).length;
  const encryptedPct =
    totalRepos > 0 ? Math.round((encryptedCount / totalRepos) * 100) : 0;

  const stats: StatProps[] = [
    {
      label: "Repositories",
      value: totalRepos,
      sub:
        running > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-1.5 animate-pulse rounded-full"
              style={{ background: "var(--warn)" }}
            />
            {running} running now
          </span>
        ) : (
          <span>{backedUp} backed up</span>
        ),
      icon: GitBranchIcon,
      tone: "neutral",
      href: "/repos",
    },
    {
      label: "Healthy",
      value: backedUp,
      sub:
        totalRepos > 0 ? (
          <span>
            {Math.round((backedUp / totalRepos) * 100)}% of total
          </span>
        ) : (
          "—"
        ),
      icon: ShieldCheckIcon,
      tone: "ok",
      href: "/repos?status=backed_up",
    },
    {
      label: "Need attention",
      value: failed,
      sub:
        failed > 0 ? (
          <span style={{ color: "var(--err)" }}>
            Review in Repositories
          </span>
        ) : (
          <span>All clear</span>
        ),
      icon: AlertTriangleIcon,
      tone: failed > 0 ? "err" : "neutral",
      href: "/repos?status=failed",
    },
    {
      label: "Encrypted",
      value: `${encryptedPct}%`,
      sub:
        totalRepos === 0 ? (
          "—"
        ) : encryptedPct < 50 ? (
          <span style={{ color: "var(--warn)" }}>
            {encryptedCount} of {totalRepos} repos
          </span>
        ) : (
          <span>
            {encryptedCount} of {totalRepos} repos
          </span>
        ),
      icon: HardDriveIcon,
      tone: "ok",
      href: "/settings/encryption",
    },
  ];

  const displayName = user?.email ? user.email.split("@")[0] : undefined;

  return (
    <AppShell>
      <div className="space-y-6">
        <Hero userName={displayName} />

        {/* Error banner */}
        {(repos.isError || destinations.isError) && (
          <div
            className="flex items-center gap-3 rounded-[12px] border px-4 py-3 text-[13px]"
            style={{
              borderColor: "color-mix(in oklch, var(--err) 35%, var(--border))",
              background: "color-mix(in oklch, var(--err) 8%, transparent)",
              color: "var(--err)",
            }}
          >
            <AlertTriangleIcon className="size-4 shrink-0" />
            Failed to load dashboard data. Please try again.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>

        {/* Activity — full width */}
        <section className="overflow-hidden rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)]">
          <header className="flex items-center justify-between border-b border-foreground/[0.05] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ActivityIcon className="size-4 text-muted-foreground" />
              <h3 className="text-[13px] font-medium">Backup activity</h3>
            </div>
            <span className="text-[11.5px] text-muted-foreground">
              Past 12 months
            </span>
          </header>
          <div className="px-5 py-5">
            <BackupHeatmap
              data={activity.data ?? []}
              isLoading={activity.isLoading}
            />
          </div>
        </section>

        {/* Storage + Recent repos */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <StorageOverview destinations={destinations.data ?? []} />
          <RecentRepos repos={repoData} />
        </div>
      </div>
    </AppShell>
  );
}
