"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getHealth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { GitbackerLogo } from "@/components/gitbacker-logo";
import { ArrowRightIcon, AlertCircleIcon } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => setVersion(h.version))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password, remember);
      router.push("/dashboard");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient mint glow, centered */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[25%] left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full opacity-50 blur-[120px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--mint) 40%, transparent), transparent 70%)",
        }}
      />
      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="relative flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center gap-3">
            <GitbackerLogo className="size-11 text-foreground" />
            <span className="font-serif text-[26px] leading-none">
              Gitbacker
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-[color-mix(in_oklch,var(--bg-1)_88%,transparent)] p-7 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-[var(--mint)]/40 to-transparent"
            />
            <h2 className="font-serif text-[26px] leading-[1.1] text-foreground">
              Welcome back
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Sign in to your Gitbacker instance.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="you@company.com"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  placeholder="••••••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-muted-foreground select-none">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(!!v)}
                />
                <span>Keep me signed in on this device</span>
              </label>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12.5px] text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="group w-full"
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
                {!isSubmitting && (
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
            {version && (
              <>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <span
                    className="size-1.5 rounded-full bg-[var(--mint)]"
                    style={{ boxShadow: "0 0 8px var(--mint)" }}
                  />
                  v{version}
                </span>
                <span className="text-foreground/20">•</span>
              </>
            )}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Apache 2.0
            </a>
            <span className="text-foreground/20">•</span>
            <span>Self-hosted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
