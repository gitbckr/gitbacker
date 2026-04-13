"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { changePassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountSettingsPage() {
  const { token, user } = useAuth();
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

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
          <Label className="text-muted-foreground">Name</Label>
          <p className="text-sm">{user?.name}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground">Role</Label>
          <p className="text-sm capitalize">{user?.role}</p>
        </div>
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
            if (newPwd.length < 4) {
              toast.error("Password must be at least 4 characters");
              return;
            }
            passwordMutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="current-pwd">Current password</Label>
            <Input
              id="current-pwd"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pwd">New password</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">Confirm new password</Label>
            <Input
              id="confirm-pwd"
              type="password"
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
