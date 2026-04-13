"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";

const settingsNav = [
  { href: "/settings/general", label: "Scheduling" },
  { href: "/settings/credentials", label: "Git Credentials" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/encryption", label: "Encryption" },
  { href: "/settings/account", label: "Account" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const allNav = isAdmin
    ? [...settingsNav, { href: "/settings/users", label: "Users" }]
    : settingsNav;

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="flex gap-8">
          <nav className="w-44 shrink-0 space-y-0.5">
            {allNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  pathname.startsWith(item.href)
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
