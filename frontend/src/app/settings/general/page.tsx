"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  getSettings,
  listEncryptionKeys,
  updateSettings,
} from "@/lib/api";
import { SchedulePicker } from "@/components/schedule-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GeneralSettingsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(token!),
    enabled: !!token,
  });

  const { data: encryptionKeys = [] } = useQuery({
    queryKey: ["encryption-keys"],
    queryFn: () => listEncryptionKeys(token!),
    enabled: !!token,
  });

  const [cronExpression, setCronExpression] = useState<string | null>(null);
  const [encryptionKeyId, setEncryptionKeyId] = useState<string | null>(null);
  const [defaultEncrypt, setDefaultEncrypt] = useState<boolean | null>(null);

  const currentCron =
    cronExpression !== null
      ? cronExpression
      : settings?.default_cron_expression ?? "";
  const currentKeyId =
    encryptionKeyId !== null
      ? encryptionKeyId
      : settings?.default_encryption_key_id ?? "none";
  const currentDefaultEncrypt =
    defaultEncrypt !== null
      ? defaultEncrypt
      : settings?.default_encrypt ?? false;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSettings(token!, {
        default_cron_expression: currentCron || null,
        default_encryption_key_id: currentKeyId === "none" ? null : currentKeyId,
        default_encrypt: currentDefaultEncrypt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setCronExpression(null);
      setEncryptionKeyId(null);
      setDefaultEncrypt(null);
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
        <h3 className="text-base font-medium mb-1">Default backup schedule</h3>
        <p className="text-sm text-muted-foreground mb-4">
          New repositories can use this schedule by default. Repos without a
          schedule are manual-only.
        </p>
        <SchedulePicker value={currentCron} onChange={setCronExpression} />
      </div>

      <div>
        <h3 className="text-base font-medium mb-1">Encryption defaults</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Select the default encryption key for new backups. Manage keys in the
          Encryption section.
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Default encryption key</Label>
            <Select value={currentKeyId} onValueChange={setEncryptionKeyId}>
              <SelectTrigger>
                <SelectValue placeholder="No encryption" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No encryption</SelectItem>
                {encryptionKeys.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name} ({k.backend.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="default-encrypt"
              checked={currentDefaultEncrypt}
              onCheckedChange={(checked) =>
                setDefaultEncrypt(checked === true)
              }
            />
            <Label htmlFor="default-encrypt" className="text-sm font-normal">
              Encrypt new repositories by default
            </Label>
          </div>
        </div>
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
