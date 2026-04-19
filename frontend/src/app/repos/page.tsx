"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  Plus,
  MoreHorizontal,
  Lock,
  GitBranchIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ------------------------------------------------------------------ */
/* Filters + sorting                                                  */
/* ------------------------------------------------------------------ */

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

type SortKey =
  | "name"
  | "status"
  | "last_backup_at"
  | "next_backup_at"
  | "cron_expression";
type SortDir = "asc" | "desc";

function compareRepos(
  a: Repository,
  b: Repository,
  key: SortKey,
  dir: SortDir,
): number {
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
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? "text-foreground" : "hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ArrowUp className="size-3" strokeWidth={2.25} />
          ) : (
            <ArrowDown className="size-3" strokeWidth={2.25} />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" strokeWidth={2.25} />
        )}
      </button>
    </TableHead>
  );
}

/* ------------------------------------------------------------------ */
/* Row URL prettifier                                                 */
/* ------------------------------------------------------------------ */

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReposPage() {
  const { token } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // --- Add dialog ---
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let scrub = false;
    if (params.get("add") === "1") {
      setOpen(true);
      scrub = true;
    }
    const status = params.get("status");
    if (status) {
      const allowed = new Set([
        ...STATUS_OPTIONS.map((o) => o.value),
        "attention",
      ]);
      if (allowed.has(status)) {
        setStatusFilter(status);
      }
      scrub = true;
    }
    if (scrub) router.replace("/repos", { scroll: false });
  }, [router]);
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

  // --- Search/filter/sort/page ---
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

  const {
    data: repos = [],
    isLoading,
    isError,
  } = useQuery({
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

  const filtered = useMemo(() => {
    let result = repos;
    if (statusFilter === "attention") {
      result = result.filter(
        (r) =>
          r.status === "failed" ||
          r.status === "access_error" ||
          r.status === "unreachable",
      );
    } else if (statusFilter !== "all") {
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

  const pagedIds = paged.map((r) => r.id);
  const allPageSelected =
    pagedIds.length > 0 && pagedIds.every((id) => selected.has(id));
  const somePageSelected = pagedIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      } catch {
        /* continue */
      }
    }
    queryClient.invalidateQueries({ queryKey: ["repositories"] });
    setSelected(new Set());
    setBatchRunning(false);
    toast.success(`Backup triggered for ${ok} repo${ok !== 1 ? "s" : ""}`);
  }

  async function batchDelete() {
    if (
      !confirm(
        `Delete ${selected.size} repository(s)? This cannot be undone.`,
      )
    )
      return;
    setBatchRunning(true);
    const ids = [...selected];
    let ok = 0;
    for (const id of ids) {
      try {
        await deleteRepository(token!, id);
        ok++;
      } catch {
        /* continue */
      }
    }
    queryClient.invalidateQueries({ queryKey: ["repositories"] });
    setSelected(new Set());
    setBatchRunning(false);
    toast.success(`${ok} repository(s) deleted`);
  }

  const setSearchAndReset = (v: string) => {
    setSearch(v);
    setPage(0);
  };
  const setStatusAndReset = (v: string) => {
    setStatusFilter(v);
    setPage(0);
  };
  const setPageSizeAndReset = (v: number) => {
    setPageSize(v);
    setPage(0);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const urlList = urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const effectiveCron = useDefaultSchedule
        ? settings?.default_cron_expression ?? undefined
        : cronExpression || undefined;
      const effectiveEncrypt =
        encryptionKeys.length > 0 &&
        (encrypt ?? settings?.default_encrypt ?? false);
      return createRepositories(token!, {
        urls: urlList,
        destination_id: destinationId || undefined,
        cron_expression: effectiveCron,
        encrypt: effectiveEncrypt,
        encryption_key_id:
          effectiveEncrypt && encryptionKeyId ? encryptionKeyId : undefined,
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

  const totalRepos = repos.length;
  const backedUp = repos.filter((r) => r.status === "backed_up").length;
  const running = repos.filter(
    (r) => r.status === "running" || r.status === "verifying",
  ).length;
  const failed = repos.filter(
    (r) =>
      r.status === "failed" ||
      r.status === "access_error" ||
      r.status === "unreachable",
  ).length;

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Sources
            </p>
            <h1 className="mt-1 font-serif text-[30px] leading-[1.05] tracking-[-0.01em]">
              Repositories
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {totalRepos} total · {backedUp} backed up
              {running > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--warn)" }}>
                    {running} running
                  </span>
                </>
              )}
              {failed > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--err)" }}>
                    {failed} failing
                  </span>
                </>
              )}
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Add repositories
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add repositories</DialogTitle>
                <DialogDescription>
                  Paste one or more git URLs, one per line. They&apos;ll be
                  queued for their first backup once added.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="urls">Repository URLs</Label>
                  <Textarea
                    id="urls"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    placeholder={
                      "https://github.com/user/repo.git\nhttps://github.com/user/repo2.git"
                    }
                    rows={5}
                    required
                  />
                  {(() => {
                    const lines = urls
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean);
                    const invalid = lines.filter(
                      (l) => !/^(https?:\/\/|git@)/.test(l),
                    ).length;
                    return invalid > 0 ? (
                      <p
                        className="flex items-start gap-1.5 text-[11.5px] leading-relaxed"
                        style={{ color: "var(--err)" }}
                      >
                        <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                        {invalid} URL{invalid === 1 ? "" : "s"} look invalid —
                        must start with <code className="font-mono">https://</code>
                        {", "}
                        <code className="font-mono">http://</code>, or{" "}
                        <code className="font-mono">git@</code>.
                      </p>
                    ) : null;
                  })()}
                  {urls.includes("git@") && (
                    <p
                      className="flex items-start gap-1.5 text-[11.5px] leading-relaxed"
                      style={{ color: "var(--warn)" }}
                    >
                      <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                      SSH URLs (<code className="font-mono">git@…</code>)
                      require a credential in{" "}
                      <span className="font-medium">
                        Settings › Git credentials
                      </span>
                      . For public repos, use HTTPS instead.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
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
                      className="cursor-pointer text-[13px] font-normal"
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

                <div className="space-y-3 rounded-[12px] border border-foreground/[0.06] bg-foreground/[0.02] p-3.5">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="encrypt"
                      checked={
                        encrypt ?? settings?.default_encrypt ?? false
                      }
                      disabled={encryptionKeys.length === 0}
                      onCheckedChange={(checked) =>
                        setEncrypt(checked === true)
                      }
                    />
                    <Label
                      htmlFor="encrypt"
                      className={`cursor-pointer text-[13px] font-medium ${
                        encryptionKeys.length === 0
                          ? "text-muted-foreground"
                          : ""
                      }`}
                    >
                      <Lock className="mr-1.5 inline size-3.5 -translate-y-px" />
                      Encrypt backups
                    </Label>
                    {encryptionKeys.length === 0 && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        Add a key in Settings first
                      </span>
                    )}
                  </div>
                  {(encrypt ?? settings?.default_encrypt ?? false) &&
                    encryptionKeys.length > 0 && (
                      <div className="space-y-1.5 pl-6">
                        <Label htmlFor="enc-key" className="text-[12px]">
                          Encryption key
                        </Label>
                        <Select
                          value={
                            encryptionKeyId ||
                            (settings?.default_encryption_key_id ?? "")
                          }
                          onValueChange={setEncryptionKeyId}
                        >
                          <SelectTrigger id="enc-key">
                            <SelectValue placeholder="Select key" />
                          </SelectTrigger>
                          <SelectContent>
                            {encryptionKeys.map((k) => (
                              <SelectItem key={k.id} value={k.id}>
                                {k.name} ({k.backend.toUpperCase()})
                                {k.id === settings?.default_encryption_key_id
                                  ? " (default)"
                                  : ""}
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
                  {createMutation.isPending ? "Adding…" : "Add repos"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2.25}
            />
            <Input
              placeholder="Search name or URL…"
              value={search}
              onChange={(e) => setSearchAndReset(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusAndReset}>
            <SelectTrigger className="w-[170px]">
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
          {(search || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchAndReset("");
                setStatusAndReset("all");
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-3" />
              Clear
            </button>
          )}
          <span className="ml-auto text-[11.5px] text-muted-foreground tabular-nums">
            {filtered.length} of {totalRepos}
          </span>
        </div>

        {/* Batch actions */}
        {selected.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-[12px] border px-4 py-2.5"
            style={{
              borderColor:
                "color-mix(in oklch, var(--mint) 35%, var(--border))",
              background: "color-mix(in oklch, var(--mint) 7%, transparent)",
            }}
          >
            <span className="text-[13px] font-medium">
              {selected.size} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={batchRunning}
                onClick={batchBackup}
              >
                <PlayIcon className="size-3.5" />
                {batchRunning ? "Running…" : "Back up now"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={batchRunning}
                onClick={batchDelete}
              >
                <Trash2Icon className="size-3.5" />
                {batchRunning ? "Deleting…" : "Delete"}
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Table / states */}
        {isLoading ? (
          <div className="overflow-hidden rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-foreground/[0.04] px-5 py-4 last:border-b-0"
              >
                <div className="size-4 shrink-0 rounded bg-foreground/[0.04] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-foreground/[0.06] animate-pulse" />
                  <div className="h-2.5 w-64 rounded bg-foreground/[0.04] animate-pulse" />
                </div>
                <div className="h-4 w-20 rounded bg-foreground/[0.04] animate-pulse" />
                <div className="h-3 w-24 rounded bg-foreground/[0.04] animate-pulse" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div
            className="flex items-center gap-3 rounded-[12px] border px-4 py-3 text-[13px]"
            style={{
              borderColor:
                "color-mix(in oklch, var(--err) 35%, var(--border))",
              background: "color-mix(in oklch, var(--err) 8%, transparent)",
              color: "var(--err)",
            }}
          >
            <AlertTriangleIcon className="size-4 shrink-0" />
            Failed to load repositories. Please try again.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-foreground/[0.1] bg-[var(--bg-1)] px-6 py-16 text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-foreground/[0.08] bg-foreground/[0.03]">
              <GitBranchIcon
                className="size-5 text-muted-foreground"
                strokeWidth={1.75}
              />
            </div>
            {repos.length === 0 ? (
              <>
                <div className="space-y-1">
                  <p className="font-serif text-[20px] leading-tight">
                    No repositories yet.
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Add your first repository to start backing it up on a
                    schedule.
                  </p>
                </div>
                <Button onClick={() => setOpen(true)} className="mt-1">
                  <Plus className="size-4" />
                  Add your first repo
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="font-serif text-[20px] leading-tight">
                    No matches.
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Try adjusting your search or status filter.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSearchAndReset("");
                    setStatusAndReset("all");
                  }}
                  className="mt-1 text-[13px] font-medium text-[var(--mint)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  Reset filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-foreground/[0.08] bg-[var(--bg-1)]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[44px] pl-5">
                    <Checkbox
                      checked={
                        allPageSelected
                          ? true
                          : somePageSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <SortableHead
                    label="Name"
                    sortKey="name"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Status"
                    sortKey="status"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Last backup"
                    sortKey="last_backup_at"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Next run"
                    sortKey="next_backup_at"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <TableHead>Destination</TableHead>
                  <TableHead className="w-[50px] pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((repo) => {
                  const dest = destinations.find(
                    (d) => d.id === repo.destination_id,
                  );
                  const isSel = selected.has(repo.id);
                  return (
                    <TableRow
                      key={repo.id}
                      data-state={isSel ? "selected" : undefined}
                      className="cursor-default"
                    >
                      <TableCell className="pl-5">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleOne(repo.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => router.push(`/repos/${repo.id}`)}
                          className="group block text-left"
                        >
                          <div className="flex items-center gap-1.5 text-[13.5px] font-medium group-hover:text-[var(--mint)] transition-colors">
                            {repo.name}
                            {repo.encrypt && (
                              <Lock
                                className="size-3 text-muted-foreground"
                                strokeWidth={2}
                              />
                            )}
                          </div>
                          <div className="mt-0.5 max-w-[280px] truncate font-mono text-[11px] text-muted-foreground">
                            {prettyUrl(repo.url)}
                          </div>
                        </button>
                      </TableCell>
                      <TableCell>
                        <RepoStatusBadge
                          status={repo.status}
                          reason={repo.status_reason}
                          variant="dot"
                        />
                      </TableCell>
                      <TableCell className="text-[12.5px] text-muted-foreground tabular-nums">
                        {repo.last_backup_at ? (
                          formatDateTime(repo.last_backup_at)
                        ) : (
                          <span className="text-muted-foreground/60">
                            Never
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[12.5px] text-muted-foreground tabular-nums">
                        {repo.next_backup_at ? (
                          formatDateTime(repo.next_backup_at)
                        ) : repo.cron_expression ? (
                          <span className="text-muted-foreground/60">
                            Calculating…
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">
                            Manual
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[12.5px] text-muted-foreground">
                        {dest?.alias ?? (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="size-7"
                              aria-label="Open menu"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => backupMutation.mutate(repo.id)}
                            >
                              <PlayIcon className="size-3.5" />
                              Run backup now
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setEditingRepo(repo)}
                            >
                              Edit…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!repo.last_backup_at}
                              onClick={() => setRestoringRepo(repo)}
                            >
                              Restore…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/repos/${repo.id}`)
                              }
                            >
                              View logs
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Delete this repository? This cannot be undone.",
                                  )
                                ) {
                                  deleteMutation.mutate(repo.id);
                                }
                              }}
                            >
                              <Trash2Icon className="size-3.5" />
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

            {/* Pagination */}
            {filtered.length > PAGE_SIZES[0] && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.05] bg-[var(--bg-1)] px-5 py-3 text-[12px]">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Rows</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSizeAndReset(Number(v))}
                  >
                    <SelectTrigger size="sm" className="h-7 w-[64px]">
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
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground tabular-nums">
                    {safePage * pageSize + 1}–
                    {Math.min(
                      (safePage + 1) * pageSize,
                      filtered.length,
                    )}{" "}
                    of {filtered.length}
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
          </div>
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
