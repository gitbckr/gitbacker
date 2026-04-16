"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  GitBranch,
  Loader2,
  Lock,
  Minus,
  PenLine,
  Plus,
  Tag,
  XCircle,
} from "lucide-react";
import {
  type BackupSnapshot,
  type DetailedPreviewResult,
  type RefDiff,
  type Repository,
  type RestoreJob,
  type RestorePreview,
  getRestoreJob,
  getRestorePreview,
  listSnapshots,
  triggerDetailedPreview,
  triggerRestore,
  triggerRestorePreview,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RestoreDialogProps = {
  repo: Repository | null;
  onOpenChange: (open: boolean) => void;
};

export function RestoreDialog({ repo, onOpenChange }: RestoreDialogProps) {
  return (
    <Dialog open={!!repo} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore repository</DialogTitle>
          <DialogDescription>
            Force-push a previous backup to a git remote. This is destructive.
          </DialogDescription>
        </DialogHeader>
        {repo ? (
          <RestoreFlow
            key={repo.id}
            repo={repo}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Step = 1 | 2 | 3 | 4;

function RestoreFlow({
  repo,
  onClose,
}: {
  repo: Repository;
  onClose: () => void;
}) {
  const { token } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    null,
  );
  const [targetUrl, setTargetUrl] = useState(repo.url);
  const [confirmed, setConfirmed] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [detailRequested, setDetailRequested] = useState(false);
  const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);

  const snapshotsQuery = useQuery({
    queryKey: ["snapshots", repo.id],
    queryFn: () => listSnapshots(token!, repo.id),
    enabled: !!token,
  });

  // Preview mutation (step 2 → 3)
  const previewMutation = useMutation({
    mutationFn: () =>
      triggerRestorePreview(token!, repo.id, {
        snapshot_id: selectedSnapshotId!,
        restore_target_url: targetUrl.trim(),
      }),
    onSuccess: (preview) => {
      setPreviewId(preview.id);
      setStep(3);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Restore mutation (step 3 → 4)
  const restoreMutation = useMutation({
    mutationFn: () =>
      triggerRestore(token!, repo.id, {
        snapshot_id: selectedSnapshotId!,
        restore_target_url: targetUrl.trim(),
      }),
    onSuccess: (job) => {
      setTriggeredJobId(job.id);
      setStep(4);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isTerminal = (status: string) =>
    status === "succeeded" || status === "failed";

  // Preview polling (step 3)
  const previewQuery = useQuery({
    queryKey: ["restore-preview", repo.id, previewId],
    queryFn: () => getRestorePreview(token!, repo.id, previewId!),
    enabled: !!token && !!previewId && step === 3,
    refetchInterval: (query) => {
      const p = query.state.data;
      if (!p) return 3000;
      if (!isTerminal(p.status)) return 3000;
      // Keep polling while detailed preview is in flight
      if (detailRequested && p.detail_status !== "succeeded" && p.detail_status !== "failed")
        return 3000;
      return false;
    },
  });

  // Restore job polling (step 4)
  const jobQuery = useQuery({
    queryKey: ["restore-job", repo.id, triggeredJobId],
    queryFn: () => getRestoreJob(token!, repo.id, triggeredJobId!),
    enabled: !!token && !!triggeredJobId && step === 4,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && isTerminal(job.status)) return false;
      return 3000;
    },
  });

  if (step === 1) {
    return (
      <StepSelectSnapshot
        repoId={repo.id}
        snapshots={snapshotsQuery.data ?? []}
        isLoading={snapshotsQuery.isLoading}
        isError={snapshotsQuery.isError}
        selectedId={selectedSnapshotId}
        onSelect={setSelectedSnapshotId}
        onCancel={onClose}
        onNext={() => setStep(2)}
      />
    );
  }

  if (step === 2) {
    return (
      <StepTargetUrl
        targetUrl={targetUrl}
        onTargetUrlChange={setTargetUrl}
        isPending={previewMutation.isPending}
        onBack={() => setStep(1)}
        onSubmit={() => previewMutation.mutate()}
      />
    );
  }

  if (step === 3) {
    return (
      <StepPreview
        repoId={repo.id}
        preview={previewQuery.data}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        isPending={restoreMutation.isPending}
        onDetailRequested={() => setDetailRequested(true)}
        onBack={() => {
          setPreviewId(null);
          setConfirmed(false);
          setDetailRequested(false);
          setStep(2);
        }}
        onSubmit={() => restoreMutation.mutate()}
      />
    );
  }

  return (
    <StepRestoreProgress
      job={jobQuery.data}
      isLoading={!jobQuery.data}
      onClose={onClose}
    />
  );
}

// --- Step 1: pick snapshot ---

function downloadSnapshot(repoId: string, snapshotId: string, decrypt: boolean) {
  const token = localStorage.getItem("gitbacker_token");
  const url = `/api/repositories/${repoId}/snapshots/${snapshotId}/download${decrypt ? "?decrypt=true" : ""}`;
  const a = document.createElement("a");
  // Use fetch to include auth header, then trigger download from blob
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error("Download failed");
      const filename =
        res.headers.get("content-disposition")?.match(/filename="?(.+?)"?$/)?.[1] ??
        "snapshot.tar.gz";
      return res.blob().then((blob) => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => toast.error("Failed to download snapshot"));
}

function StepSelectSnapshot({
  repoId,
  snapshots,
  isLoading,
  isError,
  selectedId,
  onSelect,
  onCancel,
  onNext,
}: {
  repoId: string;
  snapshots: BackupSnapshot[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Choose a snapshot to restore</Label>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading snapshots...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load snapshots.</p>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No restorable snapshots yet. Snapshots are recorded after each
            successful backup taken since the restore feature was enabled.
          </p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-1">
            {snapshots.map((s, idx) => (
              <div
                key={s.id}
                className={`flex items-center rounded-md border text-sm transition-colors ${
                  selectedId === s.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex flex-1 items-center justify-between px-3 py-2 text-left"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      Snapshot #{snapshots.length - idx}
                    </div>
                    <div
                      className="text-xs text-muted-foreground"
                      title={formatDateTime(s.created_at)}
                    >
                      {formatDateTime(s.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {s.archive_format === "tar.gz.gpg" && (
                      <span
                        title="Encrypted"
                        className="inline-flex items-center gap-1"
                      >
                        <Lock className="h-3 w-3" />
                        Encrypted
                      </span>
                    )}
                    <span className="font-mono">{s.id.slice(0, 8)}</span>
                  </div>
                </button>
                <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    title="Download archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadSnapshot(repoId, s.id, false);
                    }}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {s.archive_format === "tar.gz.gpg" && (
                    <button
                      type="button"
                      title="Download decrypted"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSnapshot(repoId, s.id, true);
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onNext} disabled={!selectedId}>
          Next
        </Button>
      </div>
    </div>
  );
}

// --- Step 2: target URL ---

function StepTargetUrl({
  targetUrl,
  onTargetUrlChange,
  isPending,
  onBack,
  onSubmit,
}: {
  targetUrl: string;
  onTargetUrlChange: (v: string) => void;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = targetUrl.trim().length > 0 && !isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="restore-target">Restore target URL</Label>
        <Input
          id="restore-target"
          value={targetUrl}
          onChange={(e) => onTargetUrlChange(e.target.value)}
          className="font-mono text-xs"
          placeholder="https://github.com/user/repo.git"
          required
        />
        <p className="text-xs text-muted-foreground">
          Defaults to the original repository URL. The snapshot will be compared
          against this remote before restoring.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? "Analyzing..." : "Preview changes"}
        </Button>
      </div>
    </form>
  );
}

// --- Step 3: preview diff ---

const ACTION_CONFIG = {
  overwrite: {
    label: "Overwritten",
    icon: PenLine,
    textClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
  },
  create: {
    label: "Created",
    icon: Plus,
    textClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  delete: {
    label: "Deleted",
    icon: Minus,
    textClass: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-50 dark:bg-red-950/30",
  },
} as const;

function refDisplayName(ref: RefDiff): string {
  return ref.ref_name
    .replace("refs/heads/", "")
    .replace("refs/tags/", "");
}

function DetailedDiffView({ data }: { data: DetailedPreviewResult }) {
  if (data.total_files === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No file differences found.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium">{data.total_files} file{data.total_files !== 1 ? "s" : ""}</span>
        {" changed: "}
        <span className="text-emerald-600">+{data.total_insertions}</span>
        {" / "}
        <span className="text-red-600">-{data.total_deletions}</span>
      </div>
      {data.refs.map((ref) => (
        <div key={ref.ref_name} className="space-y-1">
          <p className="text-xs font-medium font-mono">
            {ref.ref_name.replace("refs/heads/", "").replace("refs/tags/", "")}
            <span className="text-muted-foreground font-normal ml-2">
              {ref.total_files} file{ref.total_files !== 1 ? "s" : ""},
              {" "}<span className="text-emerald-600">+{ref.total_insertions}</span>
              {" / "}<span className="text-red-600">-{ref.total_deletions}</span>
            </span>
          </p>
          <div className="max-h-40 overflow-y-auto rounded border divide-y text-xs font-mono">
            {ref.files.map((f) => (
              <div key={f.path} className="flex items-center gap-2 px-2 py-0.5">
                <span className="truncate flex-1">{f.path}</span>
                <span className="text-emerald-600 shrink-0">+{f.insertions}</span>
                <span className="text-red-600 shrink-0">-{f.deletions}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepPreview({
  repoId,
  preview,
  confirmed,
  onConfirmedChange,
  isPending,
  onDetailRequested,
  onBack,
  onSubmit,
}: {
  repoId: string;
  preview: RestorePreview | undefined;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  isPending: boolean;
  onDetailRequested: () => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { token } = useAuth();
  const [showDetailConfirm, setShowDetailConfirm] = useState(false);

  const detailMutation = useMutation({
    mutationFn: () => triggerDetailedPreview(token!, repoId, preview!.id),
    onSuccess: () => onDetailRequested(),
    onError: (err: Error) => toast.error(err.message),
  });

  // Loading / polling
  if (
    !preview ||
    preview.status === "pending" ||
    preview.status === "running"
  ) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Analyzing changes...</p>
      </div>
    );
  }

  // Failed
  if (preview.status === "failed") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-6">
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm font-medium">Preview failed</p>
        </div>
        {preview.error_message && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-red-300 bg-red-50 p-3 text-xs font-mono text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {preview.error_message}
          </pre>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // Succeeded — render diff
  const result = preview.result_data!;
  const totalChanges = result.refs.length;

  // No changes
  if (totalChanges === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="text-sm font-medium">No changes detected</p>
          <p className="text-xs text-muted-foreground text-center">
            The remote already matches this snapshot. Nothing to restore.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const hasOverwrites =
    result.branches_overwritten + result.tags_overwritten > 0;
  const canShowDetail = hasOverwrites; // file diffs require overwritten refs with both SHAs
  const detailStatus = preview.detail_status;
  const detailLoading =
    detailStatus === "pending" || detailStatus === "running";

  // Build summary parts
  const summaryParts: string[] = [];
  const bc = result.branches_created + result.tags_created;
  const bo = result.branches_overwritten + result.tags_overwritten;
  const bd = result.branches_deleted + result.tags_deleted;
  if (bo > 0) summaryParts.push(`${bo} overwritten`);
  if (bc > 0) summaryParts.push(`${bc} created`);
  if (bd > 0) summaryParts.push(`${bd} deleted`);

  const canSubmit = confirmed && !isPending;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
        <span className="font-medium">{totalChanges} ref{totalChanges !== 1 ? "s" : ""}</span>
        {" will change: "}
        {summaryParts.join(", ")}
      </div>

      {/* Ref list */}
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {result.refs.map((ref) => {
          const config = ACTION_CONFIG[ref.action];
          const Icon = ref.ref_type === "tag" ? Tag : GitBranch;
          return (
            <div
              key={ref.ref_name}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs ${config.bgClass}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="font-mono truncate flex-1">
                {refDisplayName(ref)}
              </span>
              {ref.action === "overwrite" && (
                <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground font-mono shrink-0">
                  {ref.remote_sha?.slice(0, 7)}
                  <ArrowRight className="h-3 w-3" />
                  {ref.snapshot_sha?.slice(0, 7)}
                </span>
              )}
              <span
                className={`text-xs font-medium shrink-0 ${config.textClass}`}
              >
                {config.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Detailed preview section */}
      {canShowDetail && !detailStatus && !showDetailConfirm && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowDetailConfirm(true)}
        >
          Show file-level changes
        </Button>
      )}

      {showDetailConfirm && !detailStatus && !detailMutation.isSuccess && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <p className="text-sm">
            This will download the remote repository to compare individual files.
            It may take a while for large repos.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetailConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={detailMutation.isPending}
              onClick={() => detailMutation.mutate()}
            >
              {detailMutation.isPending ? "Starting..." : "Proceed"}
            </Button>
          </div>
        </div>
      )}

      {(detailLoading || (detailMutation.isSuccess && !detailStatus)) && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Fetching remote and comparing files...
          </p>
        </div>
      )}

      {detailStatus === "failed" && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-300 bg-red-50 p-3 text-xs font-mono text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {preview.detail_error || "Detailed preview failed"}
        </pre>
      )}

      {detailStatus === "succeeded" && preview.detail_data && (
        <DetailedDiffView data={preview.detail_data} />
      )}

      {/* Destructive warning */}
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <strong className="font-semibold">This is destructive.</strong> The
        changes shown above will be force-pushed. Refs deleted from the remote
        cannot be recovered.
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="restore-confirm"
          checked={confirmed}
          onCheckedChange={(checked) => onConfirmedChange(checked === true)}
        />
        <Label
          htmlFor="restore-confirm"
          className="text-sm font-normal leading-snug"
        >
          I understand this will overwrite the remote
        </Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="destructive"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {isPending ? "Starting..." : "Confirm and restore"}
        </Button>
      </div>
    </div>
  );
}

// --- Step 4: restore progress ---

function StepRestoreProgress({
  job,
  isLoading,
  onClose,
}: {
  job: RestoreJob | undefined;
  isLoading: boolean;
  onClose: () => void;
}) {
  if (isLoading || !job) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Starting restore...</p>
      </div>
    );
  }

  if (job.status === "pending" || job.status === "running") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-sm text-muted-foreground">
            Restore in progress...
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (job.status === "succeeded") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="text-sm font-medium">Restore complete</p>
          {job.duration_seconds != null && (
            <p className="text-xs text-muted-foreground">
              Finished in {job.duration_seconds}s
            </p>
          )}
        </div>
        {job.output_log && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs font-mono">
            {job.output_log}
          </pre>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  // failed
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-6">
        <XCircle className="h-10 w-10 text-red-500" />
        <p className="text-sm font-medium">Restore failed</p>
      </div>
      {job.output_log && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-red-300 bg-red-50 p-3 text-xs font-mono text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {job.output_log}
        </pre>
      )}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
