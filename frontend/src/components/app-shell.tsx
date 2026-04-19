"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Moon,
  Sun,
  LogOut,
  LayoutDashboard,
  GitBranch,
  HardDrive,
  Settings,
} from "lucide-react";
import { GitbackerLogo } from "@/components/gitbacker-logo";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getHealth,
  listRepositories,
  listDestinations,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

type CountKey = "repos" | "destinations" | null;

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; countKey: CountKey }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, countKey: null },
  { href: "/repos", label: "Repositories", icon: GitBranch, countKey: "repos" },
  { href: "/destinations", label: "Destinations", icon: HardDrive, countKey: "destinations" },
  { href: "/settings", label: "Settings", icon: Settings, countKey: null },
];

function initialsOf(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0];
  const parts = base.split(/[.\-_\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-8" aria-hidden />;

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative grid size-8 place-items-center rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-[var(--bg-3)] transition-colors"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    getHealth()
      .then((h) => setVersion(h.version))
      .catch(() => {});
  }, []);

  // Share query keys with page-level queries so mutation invalidations
  // (keyed on "repositories" / "destinations") refresh the sidebar counts too.
  const reposQuery = useQuery({
    queryKey: ["repositories"],
    queryFn: () => listRepositories(token!),
    enabled: !!token,
  });
  const destsQuery = useQuery({
    queryKey: ["destinations"],
    queryFn: () => listDestinations(token!),
    enabled: !!token,
  });

  const counts = {
    repos: reposQuery.data?.length,
    destinations: destsQuery.data?.length,
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <GitbackerLogo className="size-10 animate-pulse text-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const role = user.role === "admin" ? "Administrator" : "Operator";

  return (
    <div className="relative flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-[var(--bg-1)] px-4 py-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-2 pb-6"
        >
          <GitbackerLogo className="size-7 text-foreground" />
          <span className="font-serif text-[19px] leading-none">
            Gitbacker
          </span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] transition-colors ${
                  active
                    ? "bg-[var(--bg-2)] text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--bg-2)]"
                }`}
              >
                <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />
                <span className="flex-1 truncate">{item.label}</span>
                {count !== undefined && (
                  <span
                    className={`ml-auto rounded-md px-1.5 py-0.5 font-mono text-[10.5px] ${
                      active
                        ? "bg-[var(--bg-3)] text-muted-foreground"
                        : "bg-[var(--bg-2)] text-muted-foreground/80 group-hover:bg-[var(--bg-3)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {version && (
            <div className="px-3 text-[10.5px] font-mono text-muted-foreground/60">
              v{version}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-[12px] border border-border bg-[var(--bg-2)] px-2.5 py-2.5">
            <Link
              href="/settings/account"
              className="flex min-w-0 flex-1 items-center gap-2.5"
              title={user.email}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--primary)_30%,var(--bg-3))] font-mono text-[11px] font-semibold text-foreground">
                {initialsOf(user.name || user.email)}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {user.email}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {role}
                </span>
              </span>
            </Link>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={logout}
              aria-label="Log out"
              className="shrink-0 rounded-[8px]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
