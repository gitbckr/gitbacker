"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import {
  createRepositories,
  deleteRepository,
  getSettings,
  listDestinations,
  listRepositories,
  triggerBackup,
  type Repository,
} from "@/lib/api";
import { EditRepoDialog } from "@/components/edit-repo-dialog";
import { RepoStatusBadge } from "@/components/repo-status";
import { RestoreDialog } from "@/components/restore-dialog";
import { SchedulePicker } from "@/components/schedule-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatCron(cron: string | null): string {
  if (!cron) return "Manual";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hr, dom, , dow] = parts;

  const fmtTime = (h: string) =>
    `${h.padStart(2, "0")}:${min.padStart(2, "0")}`;

  // Monthly
  if (dom !== "*" && dow === "*" && hr !== "*") {
    return `Monthly on ${dom}${ordinal(Number(dom))} at ${fmtTime(hr)}`;
  }
  // Weekly
  if (dow !== "*" && dom === "*" && hr !== "*") {
    return `${DAYS[Number(dow)] ?? dow}s at ${fmtTime(hr)}`;
  }
  // Daily
  if (hr !== "*" && dom === "*" && dow === "*") {
    return `Daily at ${fmtTime(hr)}`;
  }
  // Hourly
  if (dom === "*" && dow === "*") {
    const intervalMatch = hr.match(/^\*\/(\d+)$/);
    if (hr === "*") return "Every hour";
    if (intervalMatch) return `Every ${intervalMatch[1]}h`;
  }

  return cron;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default function ReposPage() {
  const { token } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState("");
  const [destinationId, setDestinationId] = useState<string>("");
  const [cronExpression, setCronExpression] = useState("");
  const [useDefaultSchedule, setUseDefaultSchedule] = useState(false);
  const [encrypt, setEncrypt] = useState<boolean | undefined>(undefined);
  const [editingRepo, setEditingRepo] = useState<Repository | null>(null);
  const [restoringRepo, setRestoringRepo] = useState<Repository | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(token!),
    enabled: !!token,
  });

  const hasDefaultSchedule = !!settings?.default_cron_expression;

  const { data: repos = [], isLoading, isError } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => listRepositories(token!),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const { data: destinations = [] } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => listDestinations(token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const urlList = urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const effectiveCron = useDefaultSchedule
        ? settings?.default_cron_expression ?? undefined
        : cronExpression || undefined;
      return createRepositories(token!, {
        urls: urlList,
        destination_id: destinationId || undefined,
        cron_expression: effectiveCron,
        encrypt: encrypt ?? settings?.default_encrypt ?? undefined,
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setOpen(false);
      setUrls("");
      setDestinationId("");
      setCronExpression("");
      setUseDefaultSchedule(false);
      setEncrypt(undefined);
      toast.success(`${created.length} repo(s) added`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRepository(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success("Repository deleted");
    },
    onError: () => toast.error("Failed to delete repository"),
  });

  const backupMutation = useMutation({
    mutationFn: (repoId: string) => triggerBackup(token!, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success("Backup triggered");
    },
    onError: () => toast.error("Failed to trigger backup"),
  });

  const defaultDest = destinations.find((d) => d.is_default);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Repositories</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add repos</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add repositories</DialogTitle>
                <DialogDescription>
                  Paste one or more git URLs, one per line.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="urls">Repository URLs</Label>
                  <Textarea
                    id="urls"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    placeholder={"https://github.com/user/repo.git\nhttps://github.com/user/repo2.git"}
                    rows={5}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Select
                    value={destinationId}
                    onValueChange={setDestinationId}
                  >
                    <SelectTrigger id="destination">
                      <SelectValue
                        placeholder={
                          defaultDest
                            ? `${defaultDest.alias} (default)`
                            : "Select destination"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {destinations.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.alias}
                          {d.is_default ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {hasDefaultSchedule && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="use-default-schedule"
                      checked={useDefaultSchedule}
                      onCheckedChange={(checked) =>
                        setUseDefaultSchedule(checked === true)
                      }
                    />
                    <Label
                      htmlFor="use-default-schedule"
                      className="text-sm font-normal"
                    >
                      Use default schedule
                    </Label>
                  </div>
                )}
                {!useDefaultSchedule && (
                  <SchedulePicker
                    value={cronExpression}
                    onChange={setCronExpression}
                  />
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="encrypt"
                    checked={encrypt ?? settings?.default_encrypt ?? false}
                    onCheckedChange={(checked) =>
                      setEncrypt(checked === true)
                    }
                  />
                  <Label htmlFor="encrypt" className="text-sm font-normal">
                    Encrypt backups
                  </Label>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Adding..." : "Add repos"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load repositories. Please try again.</p>
        ) : repos.length === 0 ? (
          <p className="text-muted-foreground">
            No repositories yet. Click &quot;Add repos&quot; to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Backup</TableHead>
                <TableHead>Next Backup</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((repo) => {
                const dest = destinations.find(
                  (d) => d.id === repo.destination_id,
                );
                return (
                  <TableRow key={repo.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {repo.name}
                        {repo.encrypt && (
                          <span title="Encrypted" className="text-muted-foreground">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" /></svg>
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate font-mono text-xs">
                      {repo.url}
                    </TableCell>
                    <TableCell>
                      <RepoStatusBadge
                        status={repo.status}
                        reason={repo.status_reason}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {repo.last_backup_at
                        ? new Date(repo.last_backup_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {repo.next_backup_at
                        ? new Date(repo.next_backup_at).toLocaleString()
                        : repo.cron_expression
                          ? "Calculating..."
                          : "Manual"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCron(repo.cron_expression)}
                    </TableCell>
                    <TableCell>{dest?.alias ?? "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            ...
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => backupMutation.mutate(repo.id)}
                          >
                            Run now
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingRepo(repo)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!repo.last_backup_at}
                            onClick={() => setRestoringRepo(repo)}
                          >
                            Restore...
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/repos/${repo.id}`)}
                          >
                            View logs
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Delete this repository? This cannot be undone.")) {
                                deleteMutation.mutate(repo.id);
                              }
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <EditRepoDialog
          repo={editingRepo}
          destinations={destinations}
          settings={settings}
          onOpenChange={(next) => {
            if (!next) setEditingRepo(null);
          }}
        />

        <RestoreDialog
          repo={restoringRepo}
          onOpenChange={(next) => {
            if (!next) setRestoringRepo(null);
          }}
        />
      </div>
    </AppShell>
  );
}
