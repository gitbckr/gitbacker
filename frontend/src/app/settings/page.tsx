"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import {
  createEncryptionKey,
  createUser,
  deleteEncryptionKey,
  getSettings,
  listEncryptionKeys,
  listUsers,
  updateSettings,
} from "@/lib/api";
import type { EncryptionKey } from "@/lib/api";
import { SchedulePicker } from "@/components/schedule-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

function GeneralTab() {
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

  // Local state overrides fetched values
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
    onError: (err) => toast.error(err.message),
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
        <h3 className="text-base font-medium mb-1">Encryption</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Configure encryption for backup archives. Manage keys below, then
          select the default key for new backups.
        </p>
        <EncryptionKeysSection />
        <div className="mt-4 space-y-4">
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

function generatePassphrase(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = 4;
  const segmentLen = 6;
  const parts: string[] = [];
  const array = new Uint8Array(segments * segmentLen);
  crypto.getRandomValues(array);
  for (let s = 0; s < segments; s++) {
    let part = "";
    for (let i = 0; i < segmentLen; i++) {
      part += chars[array[s * segmentLen + i] % chars.length];
    }
    parts.push(part);
  }
  return parts.join("-");
}

function downloadPassphrase(passphrase: string, keyName: string) {
  const blob = new Blob(
    [`Gitbacker Encryption Key: ${keyName}\nPassphrase: ${passphrase}\n\nStore this file securely and delete it from your downloads.\n`],
    { type: "text/plain" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gitbacker-key-${keyName.toLowerCase().replace(/\s+/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function EncryptionKeysSection() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [keyData, setKeyData] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [createdPassphrase, setCreatedPassphrase] = useState<{
    name: string;
    passphrase: string;
  } | null>(null);

  const { data: keys = [] } = useQuery({
    queryKey: ["encryption-keys"],
    queryFn: () => listEncryptionKeys(token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createEncryptionKey(token!, {
        name,
        backend: "gpg",
        key_data: keyData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encryption-keys"] });
      setCreatedPassphrase({ name, passphrase: keyData });
      setOpen(false);
      setName("");
      setKeyData("");
      setShowPassphrase(false);
      toast.success("Encryption key added");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEncryptionKey(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encryption-keys"] });
      toast.success("Encryption key deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      {createdPassphrase && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
          <p className="text-sm font-medium">
            Save your passphrase for &ldquo;{createdPassphrase.name}&rdquo;
          </p>
          <p className="text-xs text-muted-foreground">
            This is the only time the passphrase will be shown. You need it to
            restore encrypted backups.
          </p>
          <code className="block rounded bg-muted px-3 py-2 text-sm font-mono select-all break-all">
            {createdPassphrase.passphrase}
          </code>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(createdPassphrase.passphrase);
                toast.success("Copied to clipboard");
              }}
            >
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadPassphrase(
                  createdPassphrase.passphrase,
                  createdPassphrase.name,
                )
              }
            >
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreatedPassphrase(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {keys.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Secret</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k: EncryptionKey) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {k.backend.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  Passphrase set
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(k.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Add key
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add encryption key</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Production backup key"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-data">Passphrase</Label>
              <div className="flex gap-2">
                <Input
                  id="key-data"
                  type={showPassphrase ? "text" : "password"}
                  placeholder="Enter or generate a passphrase"
                  value={keyData}
                  onChange={(e) => setKeyData(e.target.value)}
                  className="font-mono"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setShowPassphrase((v) => !v)}
                >
                  {showPassphrase ? "Hide" : "Show"}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeyData(generatePassphrase());
                  setShowPassphrase(true);
                }}
              >
                Generate strong passphrase
              </Button>
              <p className="text-xs text-muted-foreground">
                Used for symmetric AES-256 encryption. You will be able to
                copy or download the passphrase after saving.
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Adding..." : "Add key"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");

  const {
    data: users = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: () => createUser(token!, { name, email, password, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("operator");
      toast.success("User created");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Users</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : isError ? (
        <p className="text-sm text-red-500">
          Failed to load users. Please try again.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={u.role === "admin" ? "default" : "secondary"}
                  >
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={u.is_active ? "default" : "destructive"}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          </TabsList>
          <TabsContent value="general" className="mt-6">
            <GeneralTab />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="users" className="mt-6">
              <UsersTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
