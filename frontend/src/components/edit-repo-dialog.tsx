"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Destination,
  Repository,
  Settings,
  updateRepository,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SchedulePicker } from "@/components/schedule-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EditRepoDialogProps = {
  repo: Repository | null;
  destinations: Destination[];
  settings: Settings | undefined;
  onOpenChange: (open: boolean) => void;
};

export function EditRepoDialog({
  repo,
  destinations,
  settings,
  onOpenChange,
}: EditRepoDialogProps) {
  return (
    <Dialog open={!!repo} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit repository</DialogTitle>
          <DialogDescription>
            Update destination, schedule, and encryption for this repository.
          </DialogDescription>
        </DialogHeader>
        {repo ? (
          <EditRepoForm
            key={repo.id}
            repo={repo}
            destinations={destinations}
            settings={settings}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type EditRepoFormProps = {
  repo: Repository;
  destinations: Destination[];
  settings: Settings | undefined;
  onClose: () => void;
};

function EditRepoForm({
  repo,
  destinations,
  settings,
  onClose,
}: EditRepoFormProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [destinationId, setDestinationId] = useState(repo.destination_id);
  const [cronExpression, setCronExpression] = useState(
    repo.cron_expression ?? "",
  );
  const [useDefaultSchedule, setUseDefaultSchedule] = useState(false);
  const [encrypt, setEncrypt] = useState(repo.encrypt);

  const hasDefaultSchedule = !!settings?.default_cron_expression;

  const mutation = useMutation({
    mutationFn: () => {
      const effectiveCron = useDefaultSchedule
        ? (settings?.default_cron_expression ?? null)
        : cronExpression
          ? cronExpression
          : null;
      return updateRepository(token!, repo.id, {
        destination_id: destinationId,
        cron_expression: effectiveCron,
        encrypt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success("Repository updated");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>URL</Label>
        <p className="font-mono text-xs text-muted-foreground break-all">
          {repo.url}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-destination">Destination</Label>
        <Select value={destinationId} onValueChange={setDestinationId}>
          <SelectTrigger id="edit-destination">
            <SelectValue placeholder="Select destination" />
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
            id="edit-use-default-schedule"
            checked={useDefaultSchedule}
            onCheckedChange={(checked) =>
              setUseDefaultSchedule(checked === true)
            }
          />
          <Label
            htmlFor="edit-use-default-schedule"
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
          id="edit-encrypt"
          checked={encrypt}
          onCheckedChange={(checked) => setEncrypt(checked === true)}
        />
        <Label htmlFor="edit-encrypt" className="text-sm font-normal">
          Encrypt backups
        </Label>
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
