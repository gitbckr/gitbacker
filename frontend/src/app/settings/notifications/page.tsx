"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  type NotificationChannel,
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
  inputType?: "text" | "url" | "password" | "textarea";
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
      const parts = url.split("/");
      return parts.length > 1 ? `.../${parts.slice(-2).join("/")}` : url;
    },
  },
  discord: {
    label: "Discord",
    description: "Send alerts to a Discord channel via a webhook.",
    fields: [
      {
        key: "webhook_url",
        label: "Webhook URL",
        placeholder: "https://discord.com/api/webhooks/ID/TOKEN",
        helpText:
          "In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy URL.",
        inputType: "url",
      },
    ],
    summary: (c) => {
      const url = c.webhook_url ?? "";
      const parts = url.split("/webhooks/");
      return parts.length > 1 ? `.../${parts[1].split("/")[0]}` : url;
    },
  },
  email: {
    label: "Email (SMTP)",
    description: "Send alerts via SMTP. Works with any standard email server.",
    fields: [
      {
        key: "smtp_host",
        label: "SMTP host",
        placeholder: "smtp.example.com",
        inputType: "text",
      },
      {
        key: "smtp_port",
        label: "SMTP port",
        placeholder: "587",
        helpText: "Typical: 587 (STARTTLS), 465 (SSL), 25 (plain).",
        inputType: "text",
      },
      {
        key: "smtp_user",
        label: "SMTP username",
        placeholder: "alerts@example.com",
        inputType: "text",
      },
      {
        key: "smtp_password",
        label: "SMTP password",
        placeholder: "••••••••",
        inputType: "password",
      },
      {
        key: "from_addr",
        label: "From address",
        placeholder: "alerts@example.com",
        inputType: "text",
      },
      {
        key: "to_addrs",
        label: "To addresses",
        placeholder: "ops@example.com, oncall@example.com",
        helpText: "Comma-separated list of recipients.",
        inputType: "text",
      },
    ],
    summary: (c) => c.to_addrs ?? c.smtp_host ?? "(unconfigured)",
  },
  webhook: {
    label: "Generic webhook",
    description:
      "POST a JSON payload to any HTTPS endpoint. Good for custom integrations.",
    fields: [
      {
        key: "url",
        label: "Endpoint URL",
        placeholder: "https://example.com/alerts",
        helpText: "The endpoint will receive an Apprise-formatted JSON POST.",
        inputType: "url",
      },
    ],
    summary: (c) => c.url ?? "",
  },
  apprise_url: {
    label: "Apprise URL (advanced)",
    description:
      "Paste a raw Apprise URL for any supported service (Telegram, PagerDuty, etc.).",
    fields: [
      {
        key: "url",
        label: "Apprise URL",
        placeholder: "telegram://bot-token/chat-id",
        helpText:
          "See Apprise documentation for the full list of supported schemes.",
        inputType: "text",
      },
    ],
    summary: (c) => {
      const url = c.url ?? "";
      const scheme = url.split("://")[0];
      return scheme ? `${scheme}://…` : url;
    },
  },
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState(CHANNEL_TYPE_KEYS[0]);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Record<string, boolean>>({
    ...DEFAULT_EVENTS,
  });

  const typeDef = CHANNEL_TYPES[channelType];
  const isEditing = editingId !== null;

  const { data: channels = [] } = useQuery({
    queryKey: ["notification-channels"],
    queryFn: () => listNotificationChannels(token!),
    enabled: !!token,
  });

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setChannelType(CHANNEL_TYPE_KEYS[0]);
    setConfigFields({});
    setEvents({ ...DEFAULT_EVENTS });
  };

  const openForEdit = (c: NotificationChannel) => {
    setEditingId(c.id);
    setName(c.name);
    setChannelType(c.channel_type);
    setConfigFields({ ...c.config_data });
    setEvents({
      on_backup_failure: c.on_backup_failure,
      on_restore_failure: c.on_restore_failure,
      on_repo_verification_failure: c.on_repo_verification_failure,
      on_disk_space_low: c.on_disk_space_low,
    });
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createNotificationChannel(token!, {
        name,
        channel_type: channelType as NotificationChannel["channel_type"],
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

  const updateMutation = useMutation({
    mutationFn: () =>
      updateNotificationChannel(token!, editingId!, {
        name,
        config_data: configFields,
        ...events,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      setOpen(false);
      resetForm();
      toast.success("Notification channel updated");
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
              <DialogTitle>
                {isEditing ? "Edit notification channel" : "Add notification channel"}
              </DialogTitle>
              <DialogDescription>
                {typeDef?.description ?? "Configure a notification channel."}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isEditing) {
                  updateMutation.mutate();
                } else {
                  createMutation.mutate();
                }
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
                  maxLength={64}
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
                  disabled={isEditing}
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
                {isEditing && (
                  <p className="text-xs text-muted-foreground">
                    Channel type can&apos;t be changed. Delete and recreate to
                    switch providers.
                  </p>
                )}
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
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {isEditing
                  ? updateMutation.isPending
                    ? "Updating..."
                    : "Update channel"
                  : createMutation.isPending
                    ? "Adding..."
                    : "Add channel"}
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
              <TableHead className="w-[200px]" />
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
                        onClick={() => openForEdit(c)}
                      >
                        Edit
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
