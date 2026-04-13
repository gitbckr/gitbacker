"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createEncryptionKey,
  deleteEncryptionKey,
  getSettings,
  listEncryptionKeys,
  updateSettings,
  type EncryptionKey,
} from "@/lib/api";
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

function generatePassphrase(): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
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
    [
      `Gitbacker Encryption Key: ${keyName}\nPassphrase: ${passphrase}\n\nStore this file securely and delete it from your downloads.\n`,
    ],
    { type: "text/plain" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gitbacker-key-${keyName.toLowerCase().replace(/\s+/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EncryptionSettingsPage() {
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

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(token!),
    enabled: !!token,
  });

  const defaultKeyId = settings?.default_encryption_key_id ?? null;

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
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEncryptionKey(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encryption-keys"] });
      toast.success("Encryption key deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (keyId: string | null) =>
      updateSettings(token!, { default_encryption_key_id: keyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Default key updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleEncryptDefault = useMutation({
    mutationFn: (enabled: boolean) =>
      updateSettings(token!, { default_encrypt: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Encryption</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage encryption keys and defaults for backup archives.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="default-encrypt"
          checked={settings?.default_encrypt ?? false}
          onCheckedChange={(checked) =>
            toggleEncryptDefault.mutate(checked === true)
          }
        />
        <Label htmlFor="default-encrypt" className="text-sm font-normal">
          Encrypt new repositories by default
        </Label>
      </div>

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
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k: EncryptionKey) => {
              const isDefault = k.id === defaultKeyId;
              return (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {k.name}
                      {isDefault && <Badge>Default</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {k.backend.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    Passphrase set
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(k.id)}
                          disabled={setDefaultMutation.isPending}
                        >
                          Set as default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (isDefault) {
                            toast.error(
                              "Remove as default before deleting. Set another key as default first.",
                            );
                            return;
                          }
                          if (confirm("Delete this encryption key?")) {
                            deleteMutation.mutate(k.id);
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

      {keys.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No encryption keys configured. Add one to encrypt backup archives.
        </p>
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
