"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/api";
import { SchedulePicker } from "@/components/schedule-picker";
import { Button } from "@/components/ui/button";

export default function GeneralSettingsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(token!),
    enabled: !!token,
  });

  const [cronExpression, setCronExpression] = useState<string | null>(null);

  const currentCron =
    cronExpression !== null
      ? cronExpression
      : settings?.default_cron_expression ?? "";

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSettings(token!, {
        default_cron_expression: currentCron || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setCronExpression(null);
      toast.success("Settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-medium">Scheduling</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Default backup schedule for new repositories.
        </p>
      </div>

      <div>
        <h3 className="text-base font-medium mb-1">Default backup schedule</h3>
        <p className="text-sm text-muted-foreground mb-4">
          New repositories can use this schedule by default. Repos without a
          schedule are manual-only.
        </p>
        <SchedulePicker value={currentCron} onChange={setCronExpression} />
      </div>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
