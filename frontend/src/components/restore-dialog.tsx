"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import {
  BackupSnapshot,
  Repository,
  RestoreJob,
  getRestoreJob,
  listSnapshots,
  triggerRestore,
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

type Step = 1 | 2 | 3;

type RestoreFlowProps = {
  repo: Repository;
  onClose: () => void;
};

function RestoreFlow({ repo, onClose }: RestoreFlowProps) {
  const { token } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState(repo.url);
  const [confirmed, setConfirmed] = useState(false);
  const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);

  const snapshotsQuery = useQuery({
    queryKey: ["snapshots", repo.id],
    queryFn: () => listSnapshots(token!, repo.id),
    enabled: !!token,
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      triggerRestore(token!, repo.id, {
        snapshot_id: selectedSnapshotId!,
        restore_target_url: targetUrl.trim(),
      }),
    onSuccess: (job) => {
      setTriggeredJobId(job.id);
      setStep(3);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isTerminal = (status: string) =>
    status === "succeeded" || status === "failed";

  const jobQuery = useQuery({
    queryKey: ["restore-job", repo.id, triggeredJobId],
    queryFn: () => getRestoreJob(token!, repo.id, triggeredJobId!),
    enabled: !!token && !!triggeredJobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && isTerminal(job.status)) return false;
      return 3000;
    },
  });

  if (step === 1) {
    return (
      <Step1
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
      <Step2
        targetUrl={targetUrl}
        onTargetUrlChange={setTargetUrl}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        isPending={triggerMutation.isPending}
        onBack={() => setStep(1)}
        onSubmit={() => triggerMutation.mutate()}
      />
    );
  }

  return <Step3 job={jobQuery.data} isLoading={!jobQuery.data} onClose={onClose} />;
}

// --- Step 1: pick snapshot ---

type Step1Props = {
  snapshots: BackupSnapshot[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onNext: () => void;
};

function Step1({
  snapshots,
  isLoading,
  isError,
  selectedId,
  onSelect,
  onCancel,
  onNext,
}: Step1Props) {
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
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === s.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted/60"
                }`}
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
                    <span title="Encrypted" className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Encrypted
                    </span>
                  )}
                  <span className="font-mono">{s.id.slice(0, 8)}</span>
                </div>
              </button>
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

// --- Step 2: target URL + confirm ---

type Step2Props = {
  targetUrl: string;
  onTargetUrlChange: (v: string) => void;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
};

function Step2({
  targetUrl,
  onTargetUrlChange,
  confirmed,
  onConfirmedChange,
  isPending,
  onBack,
  onSubmit,
}: Step2Props) {
  const canSubmit = confirmed && targetUrl.trim().length > 0 && !isPending;

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
          Defaults to the original repository URL. The worker must already have
          push access to this remote (via its git config or SSH agent) — no
          credentials are accepted here.
        </p>
      </div>
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <strong className="font-semibold">This is destructive.</strong> All
        branches and tags from the selected snapshot will be force-pushed to the
        target. Anything on the remote that is not in this snapshot will be
        permanently deleted.
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="restore-confirm"
          checked={confirmed}
          onCheckedChange={(checked) => onConfirmedChange(checked === true)}
        />
        <Label htmlFor="restore-confirm" className="text-sm font-normal leading-snug">
          I understand this will overwrite the remote
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={!canSubmit} variant="destructive">
          {isPending ? "Starting..." : "Start restore"}
        </Button>
      </div>
    </form>
  );
}

// --- Step 3: progress / result ---

type Step3Props = {
  job: RestoreJob | undefined;
  isLoading: boolean;
  onClose: () => void;
};

function Step3({ job, isLoading, onClose }: Step3Props) {
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
