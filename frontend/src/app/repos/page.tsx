"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCron } from "@/lib/cron";
import { formatDateTime } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  createRepositories,
  deleteRepository,
  getSettings,
  listDestinations,
  listEncryptionKeys,
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
import { Input } from "@/components/ui/input";
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

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "backed_up", label: "Backed up" },
  { value: "scheduled", label: "Scheduled" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "access_error", label: "Access error" },
  { value: "verifying", label: "Verifying" },
];

const PAGE_SIZES = [10, 25, 50];

type SortKey = "name" | "status" | "last_backup_at" | "next_backup_at" | "cron_expression";
type SortDir = "asc" | "desc";

function compareRepos(a: Repository, b: Repository, key: SortKey, dir: SortDir): number {
  let av: string | number | null;
  let bv: string | number | null;

  switch (key) {
    case "name":
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
      break;
    case "status":
      av = a.status;
      bv = b.status;
      break;
    case "last_backup_at":
      av = a.last_backup_at ?? "";
      bv = b.last_backup_at ?? "";
      break;
    case "next_backup_at":
      av = a.next_backup_at ?? "";
      bv = b.next_backup_at ?? "";
      break;
    case "cron_expression":
      av = a.cron_expression ?? "";
      bv = b.cron_expression ?? "";
      break;
    default:
      return 0;
  }

  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}

function SortableHead({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export default function ReposPage() {
  const { token } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // --- Add repos dialog ---
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState("");
  const [destinationId, setDestinationId] = useState<string>("");
  const [cronExpression, setCronExpression] = useState("");
  const [useDefaultSchedule, setUseDefaultSchedule] = useState(false);
  const [encrypt, setEncrypt] = useState<boolean | undefined>(undefined);
  const [encryptionKeyId, setEncryptionKeyId] = useState<string>("");

  // --- Edit / Restore ---
  const [editingRepo, setEditingRepo] = useState<Repository | null>(null);
  const [restoringRepo, setRestoringRepo] = useState<Repository | null>(null);

  // --- Selection ---
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // --- Search, filter, sort, pagination ---
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

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

  const { data: encryptionKeys = [] } = useQuery({
    queryKey: ["encryption-keys"],
    queryFn: () => listEncryptionKeys(token!),
    enabled: !!token,
  });

  // --- Client-side filter + search + sort ---
  const filtered = useMemo(() => {
    let result = repos;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.url.toLowerCase().includes(q),
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => compareRepos(a, b, sortKey, sortDir));
    }
    return result;
  }, [repos, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // --- Selection helpers ---
  const pagedIds = paged.map((r) => r.id);
  const allPageSelected = pagedIds.length > 0 && pagedIds.every((id) => selected.has(id));
  const somePageSelected = pagedIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pagedIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pagedIds) next.add(id);
        return next;
      });
    }
  }

  // --- Batch actions ---
  const [batchRunning, setBatchRunning] = useState(false);

  async function batchBackup() {
    setBatchRunning(true);
    const ids = [...selected];
    let ok = 0;
    for (const id of ids) {
      try {
        await triggerBackup(token!, id);
        ok++;
      } catch { /* continue */ }
    }
    queryClient.invalidateQueries({ queryKey: ["repositories"] });
    setSelected(new Set());
    setBatchRunning(false);
    toast.success(`Backup triggered for ${ok} repo${ok !== 1 ? "s" : ""}`);
  }

  async function batchDelete() {
    if (!confirm(`Delete ${selected.size} repository(s)? This cannot be undone.`)) return;
    setBatchRunning(true);
    const ids = [...selected];
    let ok = 0;
    for (const id of ids) {
      try {
        await deleteRepository(token!, id);
        ok++;
      } catch { /* continue */ }
    }
    queryClient.invalidateQueries({ queryKey: ["repositories"] });
    setSelected(new Set());
    setBatchRunning(false);
    toast.success(`${ok} repository(s) deleted`);
  }

  // Reset to first page when filters change
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(0); };
  const setStatusAndReset = (v: string) => { setStatusFilter(v); setPage(0); };
  const setPageSizeAndReset = (v: number) => { setPageSize(v); setPage(0); };

  const createMutation = useMutation({
    mutationFn: () => {
      const urlList = urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const effectiveCron = useDefaultSchedule
        ? settings?.default_cron_expression ?? undefined
        : cronExpression || undefined;
      const effectiveEncrypt = encryptionKeys.length > 0 && (encrypt ?? settings?.default_encrypt ?? false);
      return createRepositories(token!, {
        urls: urlList,
        destination_id: destinationId || undefined,
        cron_expression: effectiveCron,
        encrypt: effectiveEncrypt,
        encryption_key_id: effectiveEncrypt && encryptionKeyId ? encryptionKeyId : undefined,
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
      setEncryptionKeyId("");
      toast.success(`${created.length} repo(s) added`);
    },
    onError: (err: Error) => toast.error(err.message),
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
      <div className="space-y-4">
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
                  {urls.includes("git@") && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      SSH URLs (git@...) require a credential in Settings &gt;
                      Git Credentials. For public repos, use HTTPS URLs instead.
                    </p>
                  )}
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
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="encrypt"
                      checked={encrypt ?? settings?.default_encrypt ?? false}
                      disabled={encryptionKeys.length === 0}
                      onCheckedChange={(checked) =>
                        setEncrypt(checked === true)
                      }
                    />
                    <Label htmlFor="encrypt" className={`text-sm font-normal ${encryptionKeys.length === 0 ? "text-muted-foreground" : ""}`}>
                      Encrypt backups
                    </Label>
                    {encryptionKeys.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        (add a key in Settings first)
                      </span>
                    )}
                  </div>
                  {(encrypt ?? settings?.default_encrypt ?? false) && encryptionKeys.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="enc-key">Encryption key</Label>
                      <Select
                        value={encryptionKeyId || (settings?.default_encryption_key_id ?? "")}
                        onValueChange={setEncryptionKeyId}
                      >
                        <SelectTrigger id="enc-key">
                          <SelectValue placeholder="Select key" />
                        </SelectTrigger>
                        <SelectContent>
                          {encryptionKeys.map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.name} ({k.backend.toUpperCase()})
                              {k.id === settings?.default_encryption_key_id ? " (default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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

        {/* --- Toolbar: search + filter --- */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or URL..."
              value={search}
              onChange={(e) => setSearchAndReset(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusAndReset}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} repo{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={batchRunning}
              onClick={batchBackup}
            >
              {batchRunning ? "Running..." : "Back up now"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={batchRunning}
              onClick={batchDelete}
            >
              {batchRunning ? "Deleting..." : "Delete"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load repositories. Please try again.</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">
            {repos.length === 0
              ? "No repositories yet. Click \"Add repos\" to get started."
              : "No repositories match your filters."}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <SortableHead label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Last Backup" sortKey="last_backup_at" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Next Backup" sortKey="next_backup_at" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>Destination</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((repo) => {
                  const dest = destinations.find(
                    (d) => d.id === repo.destination_id,
                  );
                  return (
                    <TableRow key={repo.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(repo.id)}
                          onCheckedChange={() => toggleOne(repo.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-medium">
                          {repo.name}
                          {repo.encrypt && (
                            <span title="Encrypted" className="text-muted-foreground">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" /></svg>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                          {repo.url}
                        </div>
                      </TableCell>
                      <TableCell>
                        <RepoStatusBadge
                          status={repo.status}
                          reason={repo.status_reason}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {repo.last_backup_at
                          ? formatDateTime(repo.last_backup_at)
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {repo.next_backup_at
                          ? formatDateTime(repo.next_backup_at)
                          : repo.cron_expression
                            ? "Calculating..."
                            : "Manual"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dest?.alias ?? "—"}</TableCell>
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

            {/* --- Pagination --- */}
            {filtered.length > PAGE_SIZES[0] && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSizeAndReset(Number(v))}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <EditRepoDialog
          repo={editingRepo}
          destinations={destinations}
          encryptionKeys={encryptionKeys}
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
