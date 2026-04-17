"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardDrive, GitBranch } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  createDestination,
  deleteDestination,
  listDestinations,
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
      <span className="text-sm text-muted-foreground">
        {formatBytes(used)} used
      </span>
    );
  }

  const total = used + available;
  const pct = Math.min((used / total) * 100, 100);
  const barColor =
    pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(available)} free</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Destinations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Storage locations for backup archives. Paths must exist on disk.
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
                      onChange={(e) => setPath(e.target.value.replace(/^\/+/, ""))}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alias</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Repos</TableHead>
                <TableHead className="min-w-[200px]">Storage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {destinations.map((dest) => (
                <TableRow key={dest.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      {dest.alias}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {dest.path}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <GitBranch className="h-3.5 w-3.5" />
                      {dest.repo_count}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StorageBar
                      used={dest.used_bytes}
                      available={dest.available_bytes}
                    />
                  </TableCell>
                  <TableCell>
                    {dest.is_default ? (
                      <Badge>Default</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(dest.id)}
                      >
                        Set default
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {!dest.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
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
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
