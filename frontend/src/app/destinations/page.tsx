"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cloud, GitBranch, HardDrive, Info, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import {
  createDestination,
  deleteDestination,
  Destination,
  DestinationCreateInput,
  listDestinations,
  listRepositories,
  testDestination,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Registry: drives the per-storage-type form. Mirror of the notifications
// CHANNEL_TYPES pattern (frontend/src/app/settings/notifications/page.tsx).
// Adding a new backend = one entry here + one branch in shared/storage.py +
// one new XYZStorageBackend in shared/storage_backends/.
// ---------------------------------------------------------------------------
type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  helperText?: string;
  inputType?: "text" | "password";
  required?: boolean;
  defaultValue?: string;
};

type StorageTypeDef = {
  label: string;
  description: string;
  fields: FieldDef[];
  /** Build the user-facing "location" string for the table cell. */
  describe: (dest: Destination) => string;
};

const STORAGE_TYPES: Record<"local" | "s3", StorageTypeDef> = {
  local: {
    label: "Local volume",
    description: "Write archives to a subdirectory under /data/backups.",
    fields: [
      {
        key: "path",
        label: "Subdirectory",
        placeholder: "e.g. critical",
        helperText:
          "Created automatically under /data/backups/. Leave empty to use the root.",
      },
    ],
    describe: (dest) => dest.path || "/data/backups",
  },
  s3: {
    label: "S3-compatible",
    description:
      "AWS S3, MinIO, Cloudflare R2, Wasabi, Backblaze B2 — anything that speaks S3 v4.",
    fields: [
      { key: "bucket", label: "Bucket", placeholder: "my-backups", required: true },
      {
        key: "region",
        label: "Region",
        placeholder: "us-east-1",
        defaultValue: "us-east-1",
      },
      {
        key: "endpoint_url",
        label: "Custom endpoint (optional)",
        placeholder: "https://minio.example.com or http://localhost:9000",
        helperText:
          "Leave blank for AWS. For MinIO on localhost, also set 'allow_private_endpoint' (not yet exposed).",
      },
      {
        key: "prefix",
        label: "Prefix (optional)",
        placeholder: "gitbacker/",
        helperText:
          "Archives land under this key prefix. Changing later breaks references to existing snapshots.",
      },
      {
        key: "access_key_id",
        label: "Access key ID",
        placeholder: "AKIA…",
        required: true,
      },
      {
        key: "secret_access_key",
        label: "Secret access key",
        inputType: "password",
        required: true,
      },
    ],
    describe: (dest) => {
      const bucket = dest.config_data?.bucket ?? "<no-bucket>";
      const prefix = dest.config_data?.prefix ?? "";
      return prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`;
    },
  },
};

const QUOTA_UNITS = [
  { label: "MB", bytes: 1024 ** 2 },
  { label: "GB", bytes: 1024 ** 3 },
  { label: "TB", bytes: 1024 ** 4 },
];

function quotaToFormParts(quotaBytes: number | null): {
  value: string;
  unit: string;
} {
  if (!quotaBytes) return { value: "", unit: "GB" };
  for (const u of [...QUOTA_UNITS].reverse()) {
    if (quotaBytes >= u.bytes && quotaBytes % u.bytes === 0) {
      return { value: String(quotaBytes / u.bytes), unit: u.label };
    }
  }
  return { value: String(quotaBytes / 1024 ** 2), unit: "MB" };
}

function partsToQuotaBytes(value: string, unit: string): number | null {
  const v = parseFloat(value);
  if (!value || isNaN(v) || v <= 0) return null;
  const u = QUOTA_UNITS.find((u) => u.label === unit) ?? QUOTA_UNITS[1];
  return Math.round(v * u.bytes);
}

// ---------------------------------------------------------------------------
// Capacity rendering: branches on (quota set?, available_bytes known?)
// ---------------------------------------------------------------------------
function CapacityCell({
  dest,
  onSetQuota,
}: {
  dest: Destination;
  onSetQuota: () => void;
}) {
  const hasQuota = !!dest.quota_bytes;
  const hasAvailable = dest.available_bytes !== null;

  // S3 with no quota: show used + an actionable "Set a quota" link.
  if (!hasQuota && !hasAvailable) {
    return (
      <div>
        <div className="text-[12.5px] tabular-nums text-foreground">
          {formatBytes(dest.used_bytes)} used
        </div>
        <button
          type="button"
          onClick={onSetQuota}
          className="mt-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Capacity: not tracked · Set a quota
        </button>
      </div>
    );
  }

  // Total: quota when set, otherwise used + free (the existing LOCAL behavior).
  const total = hasQuota
    ? dest.quota_bytes!
    : dest.used_bytes + (dest.available_bytes ?? 0);
  const pct = total > 0 ? Math.min((dest.used_bytes / total) * 100, 100) : 0;
  const tone =
    pct > 90 ? "var(--err)" : pct > 75 ? "var(--warn)" : "var(--mint)";
  const pctColor =
    pct > 90
      ? "var(--err)"
      : pct > 75
        ? "var(--warn)"
        : "var(--muted-foreground)";

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11.5px] tabular-nums text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">
            {formatBytes(dest.used_bytes)}
          </span>{" "}
          used · <span style={{ color: pctColor }}>{pct.toFixed(1)}%</span>
        </span>
        <span>
          {hasQuota
            ? `of ${formatBytes(dest.quota_bytes!)} quota`
            : `${formatBytes(dest.available_bytes ?? 0)} free`}
        </span>
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

const BACKUP_ROOT = "/data/backups";
const EMPTY_FIELDS: Record<string, string> = {};

export default function DestinationsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isEditing = editingId !== null;

  const [alias, setAlias] = useState("");
  const [storageType, setStorageType] = useState<"local" | "s3">("local");
  const [fields, setFields] = useState<Record<string, string>>(EMPTY_FIELDS);
  const [quotaValue, setQuotaValue] = useState("");
  const [quotaUnit, setQuotaUnit] = useState("GB");

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

  // Only aggregate destinations with known capacity for the global tiles.
  const withCapacity = destinations.filter(
    (d) => d.available_bytes != null && d.available_bytes > 0,
  );
  const totalUsed = destinations.reduce((s, d) => s + d.used_bytes, 0);
  const totalCapacity = withCapacity.reduce(
    (s, d) =>
      s +
      (d.quota_bytes ?? d.used_bytes + (d.available_bytes ?? 0)),
    0,
  );
  const usedPct =
    totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

  function resetForm() {
    setAlias("");
    setStorageType("local");
    setFields(EMPTY_FIELDS);
    setQuotaValue("");
    setQuotaUnit("GB");
    setEditingId(null);
  }

  function openForCreate() {
    resetForm();
    setOpen(true);
  }

  function openForEdit(dest: Destination) {
    setEditingId(dest.id);
    setAlias(dest.alias);
    setStorageType(dest.storage_type);

    const initial: Record<string, string> = {};
    if (dest.storage_type === "local") {
      // Strip the /data/backups/ prefix for the subdirectory input.
      initial.path = dest.path.startsWith(`${BACKUP_ROOT}/`)
        ? dest.path.slice(BACKUP_ROOT.length + 1)
        : dest.path === BACKUP_ROOT
          ? ""
          : dest.path;
    } else {
      for (const [k, v] of Object.entries(dest.config_data ?? {})) {
        initial[k] = String(v);
      }
    }
    setFields(initial);

    const q = quotaToFormParts(dest.quota_bytes);
    setQuotaValue(q.value);
    setQuotaUnit(q.unit);
    setOpen(true);
  }

  function buildSubmitPayload(): DestinationCreateInput {
    const quota_bytes = partsToQuotaBytes(quotaValue, quotaUnit);

    if (storageType === "local") {
      const sub = (fields.path ?? "").replace(/^\/+/, "");
      return {
        alias,
        storage_type: "local",
        path: sub ? `${BACKUP_ROOT}/${sub}` : BACKUP_ROOT,
        quota_bytes,
      };
    }

    // S3: drop empty fields so the server treats them as unset (relevant on
    // edit, where omitting secret_access_key means "keep existing").
    const config: Record<string, string | boolean> = {};
    for (const f of STORAGE_TYPES.s3.fields) {
      const value = fields[f.key]?.trim() ?? "";
      if (value) config[f.key] = value;
    }
    return {
      alias,
      storage_type: "s3",
      path: "",
      config_data: config,
      quota_bytes,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => createDestination(token!, buildSubmitPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      setOpen(false);
      resetForm();
      toast.success("Destination created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload = buildSubmitPayload();
      // On update, only send fields that make sense as a PATCH.
      return updateDestination(token!, editingId!, {
        alias: payload.alias,
        path: payload.path ?? undefined,
        config_data: payload.config_data,
        quota_bytes: payload.quota_bytes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      setOpen(false);
      resetForm();
      toast.success("Destination updated");
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

  const testMutation = useMutation({
    mutationFn: (id: string) => testDestination(token!, id),
    onSuccess: (data) => {
      if (data.ok) toast.success(data.message);
      else toast.error(data.message);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const def = STORAGE_TYPES[storageType];
  const visibleFields = useMemo(() => def.fields, [def]);

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
              Where archives land. Local volumes auto-create their subdirectory;
              S3-compatible buckets are tested on save.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openForCreate}>Add destination</Button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <DialogHeader>
                <DialogTitle>
                  {isEditing ? "Edit destination" : "Add destination"}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isEditing) updateMutation.mutate();
                  else createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="alias">Alias</Label>
                  <Input
                    id="alias"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="e.g. External SSD or Production S3"
                    maxLength={64}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage_type">Storage type</Label>
                  <Select
                    value={storageType}
                    onValueChange={(v) => {
                      setStorageType(v as "local" | "s3");
                      // Reset type-specific fields when switching.
                      const next: Record<string, string> = {};
                      for (const f of STORAGE_TYPES[v as "local" | "s3"].fields) {
                        if (f.defaultValue) next[f.key] = f.defaultValue;
                      }
                      setFields(next);
                    }}
                    disabled={isEditing}
                  >
                    <SelectTrigger id="storage_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STORAGE_TYPES).map(([key, def]) => (
                        <SelectItem key={key} value={key}>
                          {def.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {isEditing
                      ? "Type cannot be changed. Delete and recreate to switch."
                      : def.description}
                  </p>
                </div>

                {storageType === "local" ? (
                  <div className="space-y-2">
                    <Label htmlFor="local_path">Subdirectory</Label>
                    <div className="flex items-center rounded-md border border-input">
                      <span className="shrink-0 select-none border-r bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                        /data/backups/
                      </span>
                      <input
                        id="local_path"
                        value={fields.path ?? ""}
                        onChange={(e) =>
                          setFields((f) => ({
                            ...f,
                            path: e.target.value
                              .replace(/^\/+/, "")
                              .replace(/[^\w./\-]/g, ""),
                          }))
                        }
                        maxLength={128}
                        placeholder="e.g. critical"
                        className="flex-1 bg-transparent px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Optional subfolder within the backup volume. Created
                      automatically.
                    </p>
                  </div>
                ) : (
                  visibleFields.map((f) => (
                    <div key={f.key} className="space-y-2">
                      <Label htmlFor={f.key}>
                        {f.label}
                        {f.required && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </Label>
                      <Input
                        id={f.key}
                        type={f.inputType ?? "text"}
                        value={fields[f.key] ?? ""}
                        onChange={(e) =>
                          setFields((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                        placeholder={
                          f.inputType === "password" && isEditing
                            ? "••••••••• (leave blank to keep)"
                            : f.placeholder
                        }
                        required={f.required && !isEditing}
                      />
                      {f.helperText && (
                        <p className="text-xs text-muted-foreground">
                          {f.helperText}
                        </p>
                      )}
                    </div>
                  ))
                )}

                <div className="space-y-2">
                  <Label htmlFor="quota">Storage quota (optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="quota"
                      type="number"
                      min="0"
                      step="any"
                      value={quotaValue}
                      onChange={(e) => setQuotaValue(e.target.value)}
                      placeholder="e.g. 100"
                      className="flex-1"
                    />
                    <Select value={quotaUnit} onValueChange={setQuotaUnit}>
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUOTA_UNITS.map((u) => (
                          <SelectItem key={u.label} value={u.label}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get notified when usage exceeds 90% of this limit. Leave
                    blank for no quota alerts.
                    {storageType === "local" &&
                      " (Free-disk alerts still fire independently.)"}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {isEditing
                    ? updateMutation.isPending
                      ? "Saving..."
                      : "Save changes"
                    : createMutation.isPending
                      ? "Creating..."
                      : "Create"}
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
                <span className="text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums">
                  {totalCapacity > 0
                    ? formatBytes(totalCapacity).replace(/ .*/, "")
                    : "—"}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {totalCapacity > 0
                    ? formatBytes(totalCapacity).replace(/^[\d.]+ /, "")
                    : "no quota set on remote destinations"}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-foreground/[0.07] bg-[var(--bg-1)] px-4 py-3">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Used
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums">
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
                <span className="text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums">
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
            No destinations configured. Click "Add destination" to create one.
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
                    Location
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
                  <TableHead className="w-[200px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinations.map((dest) => {
                  const def = STORAGE_TYPES[dest.storage_type] ?? STORAGE_TYPES.local;
                  const Icon = dest.storage_type === "s3" ? Cloud : HardDrive;
                  return (
                    <TableRow
                      key={dest.id}
                      className="border-foreground/[0.06]"
                    >
                      <TableCell className="min-w-[200px]">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-foreground/[0.06] bg-foreground/[0.05] text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="whitespace-nowrap text-[13.5px] font-medium">
                              {dest.alias}
                            </div>
                            <div className="mt-px whitespace-nowrap text-[11px] text-muted-foreground">
                              {def.label}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[12.5px] text-foreground/90">
                        {def.describe(dest)}
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
                        <CapacityCell
                          dest={dest}
                          onSetQuota={() => openForEdit(dest)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              background: "var(--mint)",
                              boxShadow:
                                "0 0 0 3px color-mix(in oklch, var(--mint) 18%, transparent)",
                            }}
                          />
                          <span className="text-[12.5px]">
                            {dest.storage_type === "s3" ? "Reachable" : "Mounted"}
                          </span>
                        </div>
                        {dest.is_default && (
                          <Badge className="mt-1.5 h-auto gap-1 border-[color-mix(in_oklch,var(--mint)_30%,transparent)] bg-[color-mix(in_oklch,var(--mint)_12%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--mint)]">
                            ★ Default
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => testMutation.mutate(dest.id)}
                          disabled={testMutation.isPending}
                        >
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-1 rounded-[8px] text-muted-foreground hover:text-foreground"
                          title="Edit"
                          onClick={() => openForEdit(dest)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
            explicit choice. Set a quota on S3 destinations to track capacity
            and get usage alerts.
          </p>
        )}
      </div>
    </AppShell>
  );
}
