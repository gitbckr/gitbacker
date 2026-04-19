"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { changePassword, updateMe } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

export default function AccountSettingsPage() {
  const { token, user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  const profileMutation = useMutation({
    mutationFn: () => updateMe(token!, { name: name.trim() }),
    onSuccess: async () => {
      await refreshUser();
      toast.success("Profile updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const nameDirty = name.trim() !== (user?.name ?? "") && name.trim() !== "";

  const passwordMutation = useMutation({
    mutationFn: () =>
      changePassword(token!, {
        current_password: currentPwd,
        new_password: newPwd,
      }),
    onSuccess: () => {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      toast.success("Password changed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal account settings.
        </p>
      </div>

      <div className="max-w-md space-y-4">
        <div className="space-y-1">
          <Label className="text-muted-foreground">Email</Label>
          <p className="text-sm">{user?.email}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground">Role</Label>
          <p className="text-sm capitalize">{user?.role}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameDirty) return;
            profileMutation.mutate();
          }}
          className="space-y-2"
        >
          <Label htmlFor="profile-name">Name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              required
            />
            <Button
              type="submit"
              size="sm"
              disabled={!nameDirty || profileMutation.isPending}
            >
              {profileMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>

      <div className="max-w-md space-y-4">
        <h3 className="text-base font-medium">Change password</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPwd !== confirmPwd) {
              toast.error("Passwords do not match");
              return;
            }
            if (newPwd.length < 8) {
              toast.error("Password must be at least 8 characters");
              return;
            }
            passwordMutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="current-pwd">Current password</Label>
            <PasswordInput
              id="current-pwd"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pwd">New password</Label>
            <PasswordInput
              id="new-pwd"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              minLength={8}
              required
            />
            {newPwd.length > 0 && newPwd.length < 8 && (
              <p className="text-xs text-red-500">
                Must be at least 8 characters
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">Confirm new password</Label>
            <PasswordInput
              id="confirm-pwd"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={passwordMutation.isPending}>
            {passwordMutation.isPending ? "Changing..." : "Change password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
