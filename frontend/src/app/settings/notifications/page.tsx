"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  testNotificationChannel,
  updateNotificationChannel,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
// Channel type registry — add a new entry here to support a new backend.
// ---------------------------------------------------------------------------

type ConfigFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  helpText?: string;
  inputType?: "text" | "url" | "textarea";
};

type ChannelTypeDef = {
  label: string;
  description: string;
  fields: ConfigFieldDef[];
  /** Shown in the table as a short summary. Receives config_data. */
  summary: (config: Record<string, string>) => string;
};

const CHANNEL_TYPES: Record<string, ChannelTypeDef> = {
  slack: {
    label: "Slack",
    description: "Send alerts to a Slack channel via incoming webhook.",
    fields: [
      {
        key: "webhook_url",
        label: "Webhook URL",
        placeholder: "https://hooks.slack.com/services/...",
        helpText:
          "Create an incoming webhook in your Slack workspace settings.",
        inputType: "url",
      },
    ],
    summary: (c) => {
      const url = c.webhook_url ?? "";
      // Show last segment of the webhook path for identification
      const parts = url.split("/");
      return parts.length > 1 ? `.../${parts.slice(-2).join("/")}` : url;
    },
  },
  // Future examples:
  // discord: { label: "Discord", description: "...", fields: [...], summary: ... },
  // email:   { label: "Email",   description: "...", fields: [...], summary: ... },
};

const CHANNEL_TYPE_KEYS = Object.keys(CHANNEL_TYPES);

// ---------------------------------------------------------------------------
// Event definitions
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
  on_backup_failure: "Backup failures",
  on_restore_failure: "Restore failures",
  on_repo_verification_failure: "Verification failures",
  on_disk_space_low: "Disk space alerts",
};

const EVENT_KEYS = Object.keys(EVENT_LABELS) as Array<
  keyof typeof EVENT_LABELS
>;

const DEFAULT_EVENTS: Record<string, boolean> = {
  on_backup_failure: true,
  on_restore_failure: true,
  on_repo_verification_failure: true,
  on_disk_space_low: true,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsSettingsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState(CHANNEL_TYPE_KEYS[0]);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Record<string, boolean>>({
    ...DEFAULT_EVENTS,
  });

  const typeDef = CHANNEL_TYPES[channelType];

  const { data: channels = [] } = useQuery({
    queryKey: ["notification-channels"],
    queryFn: () => listNotificationChannels(token!),
    enabled: !!token,
  });

  const resetForm = () => {
    setName("");
    setChannelType(CHANNEL_TYPE_KEYS[0]);
    setConfigFields({});
    setEvents({ ...DEFAULT_EVENTS });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createNotificationChannel(token!, {
        name,
        channel_type: channelType as "slack",
        config_data: configFields,
        ...events,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      setOpen(false);
      resetForm();
      toast.success("Notification channel added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotificationChannel(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      toast.success("Notification channel deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testNotificationChannel(token!, id),
    onSuccess: () => toast.success("Test notification sent"),
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateNotificationChannel(token!, id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Get notified when backups fail, restores fail, or disk space runs
            low.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>Add channel</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add notification channel</DialogTitle>
              <DialogDescription>
                {typeDef?.description ?? "Configure a notification channel."}
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
                <Label htmlFor="channel-name">Name</Label>
                <Input
                  id="channel-name"
                  placeholder="e.g. #ops-alerts"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="channel-type">Type</Label>
                <Select
                  value={channelType}
                  onValueChange={(v) => {
                    setChannelType(v);
                    setConfigFields({});
                  }}
                >
                  <SelectTrigger id="channel-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {CHANNEL_TYPES[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {typeDef?.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`config-${field.key}`}>{field.label}</Label>
                  {field.inputType === "textarea" ? (
                    <Textarea
                      id={`config-${field.key}`}
                      placeholder={field.placeholder}
                      value={configFields[field.key] ?? ""}
                      onChange={(e) =>
                        setConfigFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="font-mono text-xs"
                      rows={4}
                      required
                    />
                  ) : (
                    <Input
                      id={`config-${field.key}`}
                      type={field.inputType ?? "text"}
                      placeholder={field.placeholder}
                      value={configFields[field.key] ?? ""}
                      onChange={(e) =>
                        setConfigFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="font-mono text-xs"
                      required
                    />
                  )}
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">
                      {field.helpText}
                    </p>
                  )}
                </div>
              ))}

              <div className="space-y-3">
                <Label>Events</Label>
                {EVENT_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`event-${key}`}
                      checked={events[key] ?? false}
                      onCheckedChange={(checked) =>
                        setEvents((prev) => ({
                          ...prev,
                          [key]: checked === true,
                        }))
                      }
                    />
                    <Label
                      htmlFor={`event-${key}`}
                      className="text-sm font-normal"
                    >
                      {EVENT_LABELS[key]}
                    </Label>
                  </div>
                ))}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Adding..." : "Add channel"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notification channels configured. Add one to receive alerts when
          things go wrong.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Config</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((c) => {
              const def = CHANNEL_TYPES[c.channel_type];
              const activeEvents = EVENT_KEYS.filter(
                (k) => c[k as keyof typeof c],
              );
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {def?.label ?? c.channel_type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                    {def?.summary(c.config_data) ?? JSON.stringify(c.config_data)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {activeEvents.map((k) => (
                        <Badge
                          key={k}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {EVENT_LABELS[k]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={c.enabled}
                      onCheckedChange={(checked) =>
                        toggleEnabled.mutate({
                          id: c.id,
                          enabled: checked === true,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testMutation.mutate(c.id)}
                        disabled={testMutation.isPending}
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this notification channel?")) {
                            deleteMutation.mutate(c.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
