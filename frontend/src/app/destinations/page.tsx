"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardDrive, GitBranch, Trash2, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  createDestination,
  deleteDestination,
  listDestinations,
  listRepositories,
  updateDestination,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StorageBar({
  used,
  available,
}: {
  used: number;
  available: number | null;
}) {
  if (available === null || available === 0) {
    return (
      <span className="text-[12.5px] text-muted-foreground tabular-nums">
        {formatBytes(used)} used
      </span>
    );
  }

  const total = used + available;
  const pct = Math.min((used / total) * 100, 100);
  const tone =
    pct > 85 ? "var(--err)" : pct > 70 ? "var(--warn)" : "var(--mint)";
  const pctColor =
    pct > 85
      ? "var(--err)"
      : pct > 70
        ? "var(--warn)"
        : "var(--muted-foreground)";

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11.5px] tabular-nums text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">
            {formatBytes(used)}
          </span>{" "}
          used ·{" "}
          <span style={{ color: pctColor }}>{pct.toFixed(1)}%</span>
        </span>
        <span>{formatBytes(available)} free</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: tone,
            boxShadow: `0 0 10px -2px ${tone}`,
          }}
        />
      </div>
    </div>
  );
}

export default function DestinationsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const [path, setPath] = useState("");

  const { data: destinations = [], isLoading, isError } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => listDestinations(token!),
    enabled: !!token,
  });

  const { data: repos = [] } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => listRepositories(token!),
    enabled: !!token,
  });

  const totalUsed = destinations.reduce((s, d) => s + d.used_bytes, 0);
  const totalCapacity = destinations.reduce(
    (s, d) => s + d.used_bytes + (d.available_bytes ?? 0),
    0,
  );
  const usedPct =
    totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

  const BACKUP_ROOT = "/data/backups";
  const fullPath = path ? `${BACKUP_ROOT}/${path}` : BACKUP_ROOT;

  const createMutation = useMutation({
    mutationFn: () =>
      createDestination(token!, { alias, path: fullPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      setOpen(false);
      setAlias("");
      setPath("");
      toast.success("Destination created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDestination(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      toast.success("Destination deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      updateDestination(token!, id, { is_default: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      toast.success("Default destination updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Storage
            </p>
            <h1 className="mt-1 font-serif text-[30px] leading-[1.05] tracking-[-0.01em]">
              Destinations
            </h1>
            <p className="mt-1.5 max-w-[560px] text-[13px] text-muted-foreground">
              Where archives land. Paths must exist on disk before saving —
              the directory will be created if missing.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add destination</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add destination</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="alias">Alias</Label>
                  <Input
                    id="alias"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="e.g. External SSD"
                    maxLength={64}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="path">Subdirectory</Label>
                  <div className="flex items-center rounded-md border border-input">
                    <span className="shrink-0 select-none border-r bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                      /data/backups/
                    </span>
                    <input
                      id="path"
                      value={path}
                      onChange={(e) =>
                        setPath(
                          e.target.value
                            .replace(/^\/+/, "")
                            .replace(/[^\w./\-]/g, ""),
                        )
                      }
                      maxLength={128}
                      placeholder="e.g. critical"
                      className="flex-1 bg-transparent px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional subfolder within the backup volume. Leave empty to use
                    the root. The directory will be created automatically.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {destinations.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-foreground/[0.07] bg-[var(--bg-1)] px-4 py-3">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Total capacity
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-serif text-[26px] leading-none tabular-nums">
                  {formatBytes(totalCapacity).replace(/ .*/, "")}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {formatBytes(totalCapacity).replace(/^[\d.]+ /, "")}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-foreground/[0.07] bg-[var(--bg-1)] px-4 py-3">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Used
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-serif text-[26px] leading-none tabular-nums">
                  {formatBytes(totalUsed).replace(/ .*/, "")}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {formatBytes(totalUsed).replace(/^[\d.]+ /, "")}
                  {totalCapacity > 0 && ` · ${usedPct.toFixed(1)}%`}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-foreground/[0.07] bg-[var(--bg-1)] px-4 py-3">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Repos placed
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-serif text-[26px] leading-none tabular-nums">
                  {repos.length}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  across {destinations.length} destination
                  {destinations.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">
            Failed to load destinations. Please try again.
          </p>
        ) : destinations.length === 0 ? (
          <p className="text-muted-foreground">
            No destinations configured. Restart the API to provision the default
            local destination.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)]">
            <Table>
              <TableHeader>
                <TableRow className="border-foreground/[0.06] hover:bg-transparent">
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-[0.1em]">
                    Alias
                  </TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-[0.1em]">
                    Path
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10.5px] uppercase tracking-[0.1em]">
                    Repos
                  </TableHead>
                  <TableHead className="min-w-[280px] font-mono text-[10.5px] uppercase tracking-[0.1em]">
                    Capacity
                  </TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-[0.1em]">
                    Status
                  </TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinations.map((dest) => {
                  const cap =
                    dest.available_bytes != null
                      ? dest.used_bytes + dest.available_bytes
                      : null;
                  const pct =
                    cap != null && cap > 0
                      ? (dest.used_bytes / cap) * 100
                      : null;
                  const health =
                    pct != null && pct > 85
                      ? { color: "var(--err)", label: "Low space" }
                      : pct != null && pct > 70
                        ? { color: "var(--warn)", label: "High usage" }
                        : { color: "var(--mint)", label: "Mounted" };
                  return (
                    <TableRow
                      key={dest.id}
                      className="border-foreground/[0.06]"
                    >
                      <TableCell className="min-w-[200px]">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-foreground/[0.06] bg-foreground/[0.05] text-muted-foreground">
                            <HardDrive className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="whitespace-nowrap text-[13.5px] font-medium">
                              {dest.alias}
                            </div>
                            <div className="mt-px whitespace-nowrap text-[11px] text-muted-foreground">
                              Local volume
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[12.5px] text-foreground/90">
                        {dest.path}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-muted-foreground">
                          <GitBranch className="h-3 w-3" />
                          <span className="font-medium text-foreground">
                            {dest.repo_count}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <StorageBar
                          used={dest.used_bytes}
                          available={dest.available_bytes}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              background: health.color,
                              boxShadow: `0 0 0 3px color-mix(in oklch, ${health.color} 18%, transparent)`,
                            }}
                          />
                          <span className="text-[12.5px]">
                            {health.label}
                          </span>
                        </div>
                        {dest.is_default && (
                          <Badge className="mt-1.5 h-auto gap-1 border-[color-mix(in_oklch,var(--mint)_30%,transparent)] bg-[color-mix(in_oklch,var(--mint)_12%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--mint)]">
                            ★ Default
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!dest.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDefaultMutation.mutate(dest.id)
                            }
                          >
                            Set default
                          </Button>
                        )}
                        {!dest.is_default && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="ml-1 rounded-[8px] text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete "${dest.alias}"? Repos using this destination will need to be reassigned.`,
                                )
                              ) {
                                deleteMutation.mutate(dest.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {destinations.length > 0 && !isLoading && (
          <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            The default destination is used when a repo is added without an
            explicit choice. Removing a destination requires reassigning any
            repos placed there.
          </p>
        )}
      </div>
    </AppShell>
  );
}
