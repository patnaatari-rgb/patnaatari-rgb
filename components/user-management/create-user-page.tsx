"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { BASE_ROLES, scopeFieldFor } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import {
  KVK_USER_ROLE,
  roleByName,
  roleSlugFromName,
  scopeBodyKey,
  scopeOptionsFor,
} from "@/components/user-management/user-form-shared";

type UserFormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  roleName: string;
  scopeValue: string;
};

function emptyForm(isKvk: boolean, kvkName: string | undefined): UserFormState {
  return isKvk
    ? {
        fullName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        roleName: KVK_USER_ROLE,
        scopeValue: kvkName ?? "",
      }
    : {
        fullName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        roleName: "",
        scopeValue: "",
      };
}

type CreateUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

/**
 * Create User, as a popup dialog matching the Role Management "Add Role"
 * popup's treatment (bigger dialog, red required-field asterisks) - client
 * direction, 2026-08-31, replacing the earlier dedicated full page.
 */
export function CreateUserDialog({ open, onOpenChange, onCreated }: CreateUserDialogProps) {
  const session = useSession();
  const isKvk = session.role !== "super-admin";

  const [form, setForm] = useState<UserFormState>(() => emptyForm(isKvk, session.kvkName));
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm(isKvk, session.kvkName));
      setFormError(null);
      setShowPassword(false);
    }
    // Resets only when the dialog opens; re-running on session changes would wipe a half-filled form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedRole = roleByName(form.roleName);
  const scopeField = selectedRole ? scopeFieldFor(selectedRole.scope) : null;
  const scopeOptions = scopeOptionsFor(scopeField);

  function updateForm<K extends keyof UserFormState>(
    key: K,
    value: UserFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onRoleChange(roleName: string) {
    setForm((prev) => ({ ...prev, roleName, scopeValue: "" }));
  }

  async function submitForm() {
    if (!form.fullName.trim() || !form.email.trim() || !form.roleName) {
      setFormError("Full name, email and role are required.");
      return;
    }
    if (scopeField && !form.scopeValue) {
      setFormError(`${scopeField.label} is required for this role.`);
      return;
    }
    if (!form.password || form.password !== form.confirmPassword) {
      setFormError("Password and confirm password do not match.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.fullName.trim(),
          username: form.email.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          roleSlug: roleSlugFromName(form.roleName),
          ...(scopeField && scopeBodyKey(scopeField.kind)
            ? { [scopeBodyKey(scopeField.kind)!]: form.scopeValue }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error ?? "Could not create this user.");
        return;
      }
      onOpenChange(false);
      onCreated();
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-name" className="text-primary">Full Name</Label>
            <Input
              id="user-name"
              className="h-10"
              placeholder="Enter full name"
              value={form.fullName}
              onChange={(event) => updateForm("fullName", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-email" className="text-primary">Email</Label>
            <Input
              id="user-email"
              className="h-10"
              type="email"
              placeholder="name@atariams.org"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-phone" className="text-primary">Phone Number (Optional)</Label>
            <Input
              id="user-phone"
              className="h-10"
              placeholder="10-digit mobile (6–9...)"
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-password" className="text-primary">Password</Label>
            <div className="relative">
              <Input
                id="user-password"
                className="h-10 pr-9"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => updateForm("password", event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Must contain uppercase, lowercase, and number
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-confirm-password" className="text-primary">Confirm Password</Label>
            <Input
              id="user-confirm-password"
              className="h-10"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirm password"
              value={form.confirmPassword}
              onChange={(event) =>
                updateForm("confirmPassword", event.target.value)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-role" className="text-primary">
              Role <span className="text-destructive">*</span>
            </Label>
            {isKvk ? (
              <Input id="user-role" className="h-10" value={KVK_USER_ROLE} disabled />
            ) : (
              <Select
                value={form.roleName}
                onValueChange={(value) => onRoleChange(value as string)}
              >
                <SelectTrigger id="user-role" className="h-10 w-full">
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent>
                  {BASE_ROLES.map((role) => (
                    <SelectItem key={role.name} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {scopeField &&
            (isKvk ? (
              <div className="space-y-1.5">
                <Label htmlFor="user-scope-text" className="text-primary">
                  {scopeField.label} <span className="text-destructive">*</span>
                </Label>
                <Input id="user-scope-text" className="h-10" value={form.scopeValue} disabled />
              </div>
            ) : scopeOptions ? (
              <div className="space-y-1.5">
                <Label htmlFor="user-scope" className="text-primary">
                  {scopeField.label} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.scopeValue}
                  onValueChange={(value) =>
                    updateForm("scopeValue", value as string)
                  }
                >
                  <SelectTrigger id="user-scope" className="h-10 w-full">
                    <SelectValue placeholder={scopeField.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="user-scope-text" className="text-primary">
                  {scopeField.label} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="user-scope-text"
                  className="h-10"
                  placeholder={scopeField.placeholder}
                  value={form.scopeValue}
                  onChange={(event) =>
                    updateForm("scopeValue", event.target.value)
                  }
                />
              </div>
            ))}
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submitForm} disabled={submitting}>
            {submitting ? "Creating…" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
