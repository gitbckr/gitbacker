"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createGitCredential,
  deleteGitCredential,
  listGitCredentials,
} from "@/lib/api";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const TYPE_LABELS: Record<string, string> = {
  pat: "PAT",
  ssh_key: "SSH Key",
};

export default function CredentialsSettingsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [credentialType, setCredentialType] = useState<"pat" | "ssh_key">(
    "pat",
  );
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("x-access-token");
  const [credentialData, setCredentialData] = useState("");

  const { data: credentials = [] } = useQuery({
    queryKey: ["git-credentials"],
    queryFn: () => listGitCredentials(token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createGitCredential(token!, {
        name,
        credential_type: credentialType,
        host: host.trim().toLowerCase(),
        credential_data: credentialData,
        username: credentialType === "pat" ? username : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-credentials"] });
      setOpen(false);
      setName("");
      setCredentialType("pat");
      setHost("");
      setUsername("x-access-token");
      setCredentialData("");
      toast.success("Git credential added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGitCredential(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-credentials"] });
      toast.success("Git credential deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Git Credentials</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Store credentials for accessing private repositories. Matched by
            hostname when backing up or restoring repos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add credential</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add git credential</DialogTitle>
              <DialogDescription>
                Add a PAT or SSH key to authenticate with a git host.
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
                <Label htmlFor="cred-name">Name</Label>
                <Input
                  id="cred-name"
                  placeholder="e.g. GitHub PAT"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cred-type">Type</Label>
                <Select
                  value={credentialType}
                  onValueChange={(v) =>
                    setCredentialType(v as "pat" | "ssh_key")
                  }
                >
                  <SelectTrigger id="cred-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pat">
                      Personal Access Token (PAT)
                    </SelectItem>
                    <SelectItem value="ssh_key">SSH Private Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cred-host">Host</Label>
                <Input
                  id="cred-host"
                  placeholder="github.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The hostname to match against repository URLs. One credential
                  per host.
                </p>
              </div>
              {credentialType === "pat" && (
                <div className="space-y-2">
                  <Label htmlFor="cred-username">Username</Label>
                  <Input
                    id="cred-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    GitHub and GitLab use <code>x-access-token</code>. Bitbucket
                    uses your Atlassian username.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="cred-data">
                  {credentialType === "pat" ? "Token" : "Private key"}
                </Label>
                {credentialType === "pat" ? (
                  <Input
                    id="cred-data"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={credentialData}
                    onChange={(e) => setCredentialData(e.target.value)}
                    className="font-mono"
                    required
                  />
                ) : (
                  <Textarea
                    id="cred-data"
                    placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n..."}
                    value={credentialData}
                    onChange={(e) => setCredentialData(e.target.value)}
                    className="font-mono text-xs max-h-48 resize-none"
                    rows={6}
                    required
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {credentialType === "pat"
                    ? "The token is stored securely and never shown again after saving."
                    : "Paste the full private key including BEGIN/END markers."}
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Adding..." : "Add credential"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No git credentials configured. Add one to back up or restore private
          repositories.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Username / Public Key</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {TYPE_LABELS[c.credential_type] ?? c.credential_type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{c.host}</TableCell>
                <TableCell>
                  {c.credential_type === "pat" ? (
                    <span className="text-sm text-muted-foreground">
                      {c.username}
                    </span>
                  ) : c.public_key ? (
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {c.public_key}
                      </code>
                      <button
                        type="button"
                        title="Copy public key"
                        onClick={() => {
                          navigator.clipboard.writeText(c.public_key!);
                          toast.success("Public key copied");
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this credential? Backups using this host will lose access.",
                        )
                      ) {
                        deleteMutation.mutate(c.id);
                      }
                    }}
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
    </div>
  );
}
