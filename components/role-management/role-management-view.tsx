"use client";

import { useEffect, useMemo, useState } from "react";
import { usePolling } from "@/lib/use-polling";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HIERARCHY_LEVELS, PERMISSIONS } from "@/lib/rbac";
import { useSession } from "@/lib/session";

type Role = {
  id: string;
  name: string;
  hierarchyLevel: number;
  description: string;
  isSystemRole: boolean;
  userCount: number;
  permissions: string[];
};

type RoleFormState = {
  name: string;
  hierarchyLevel: string;
  description: string;
};

const EMPTY_FORM: RoleFormState = {
  name: "",
  hierarchyLevel: "",
  description: "",
};

/**
 * Role Management screen, wired to the real /api/roles CRUD + Manage
 * Permissions endpoint. Only Super Admin gets Add/Edit/Delete/Manage
 * Permissions (client spec's Action Control table: every other role tops
 * out at View) - a system role's own name/slug stays protected even for
 * Super Admin (hierarchy level and description can still change).
 */
export function RoleManagementView() {
  const session = useSession();
  const canManage = session.role === "super-admin";

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [permissionsRole, setPermissionsRole] = useState<Role | null>(null);
  const [checkedPermissions, setCheckedPermissions] = useState<Set<string>>(new Set());
  const [permissionsSubmitting, setPermissionsSubmitting] = useState(false);

  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** `silent` skips the loading state - used for background polling refreshes so the table doesn't flash "Loading roles..." over data that's already on screen. */
  function loadRoles(silent = false) {
    if (!silent) setLoading(true);
    fetch("/api/roles")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { roles: Role[] }) => {
        setRoles(data.roles);
        setListError(null);
      })
      .catch(() => {
        if (!silent) setListError("Could not load roles.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => loadRoles(), []);
  usePolling(() => loadRoles(true));

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roles;
    return roles.filter((role) => role.name.toLowerCase().includes(query));
  }, [search, roles]);

  function openCreate() {
    setEditingRole(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(role: Role) {
    setEditingRole(role);
    setForm({
      name: role.name,
      hierarchyLevel: String(role.hierarchyLevel),
      description: role.description,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim() || !form.hierarchyLevel) return;
    setFormError(null);
    setFormSubmitting(true);
    try {
      const response = await fetch(editingRole ? `/api/roles/${editingRole.id}` : "/api/roles", {
        method: editingRole ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          hierarchyLevel: Number(form.hierarchyLevel),
          description: form.description.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error ?? "Could not save this role.");
        return;
      }
      setFormOpen(false);
      loadRoles();
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setFormSubmitting(false);
    }
  }

  function openPermissions(role: Role) {
    setPermissionsRole(role);
    setCheckedPermissions(new Set(role.permissions));
  }

  function togglePermission(permission: string) {
    setCheckedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  async function submitPermissions() {
    if (!permissionsRole) return;
    setPermissionsSubmitting(true);
    try {
      const response = await fetch(`/api/roles/${permissionsRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(checkedPermissions) }),
      });
      if (response.ok) {
        setPermissionsRole(null);
        loadRoles();
      }
    } finally {
      setPermissionsSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRole) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const response = await fetch(`/api/roles/${deleteRole.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setDeleteError(data.error ?? "Could not delete this role.");
        return;
      }
      setDeleteRole(null);
      loadRoles();
    } catch {
      setDeleteError("Could not reach the server. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by role name..."
            className="h-10 w-96 pl-9"
          />
        </div>
        {canManage && (
          <Button size="lg" onClick={openCreate}>
            <Plus className="size-4" />
            Add Role
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TableHead className="w-16 px-4 py-3">S.No.</TableHead>
            <TableHead className="px-4 py-3">Name</TableHead>
            {canManage && (
              <TableHead className="w-16 px-4 py-3 text-right">
                Actions
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={canManage ? 3 : 2} className="px-4 py-16 text-center text-muted-foreground">
                Loading roles...
              </TableCell>
            </TableRow>
          ) : listError ? (
            <TableRow>
              <TableCell colSpan={canManage ? 3 : 2} className="px-4 py-16 text-center text-destructive">
                {listError}
              </TableCell>
            </TableRow>
          ) : filteredRoles.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={canManage ? 3 : 2}
                className="px-4 py-16 text-center text-muted-foreground"
              >
                No roles found.
              </TableCell>
            </TableRow>
          ) : (
            filteredRoles.map((role, index) => (
              <TableRow key={role.id}>
                <TableCell className="px-4 py-4 text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="px-4 py-4 font-medium text-foreground">
                  {role.name}
                </TableCell>
                {canManage && (
                  <TableCell className="px-4 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button aria-label="Role actions" variant="ghost" size="icon-sm">
                            <MoreVertical className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-max min-w-40 whitespace-nowrap">
                        <DropdownMenuItem onClick={() => openEdit(role)}>
                          <Pencil className="size-3.5" />
                          Edit Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openPermissions(role)}>
                          <ShieldCheck className="size-3.5" />
                          Manage Permissions
                        </DropdownMenuItem>
                        {!role.isSystemRole && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setDeleteRole(role);
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            Delete Role
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <span>
          Showing {filteredRoles.length === 0 ? 0 : 1} to {filteredRoles.length}{" "}
          of {filteredRoles.length} entries
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled>
            1
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>

      {/* Add / Edit Role */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">
                Role Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="role-name"
                className="h-10"
                placeholder="e.g. custom_admin"
                value={form.name}
                disabled={editingRole?.isSystemRole}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {editingRole?.isSystemRole
                  ? "System role names can't be changed."
                  : "Use snake_case (e.g. state_admin, state_user)"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hierarchy-level">
                Hierarchy Level <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.hierarchyLevel}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    hierarchyLevel: value as string,
                  }))
                }
              >
                <SelectTrigger id="hierarchy-level" className="w-full">
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  {HIERARCHY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Lower number = higher authority. Affects who can see and manage
                this role.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-description">Description</Label>
              <Textarea
                id="role-description"
                placeholder="Optional description of this role"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={formSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              disabled={!form.name.trim() || !form.hierarchyLevel || formSubmitting}
            >
              {formSubmitting ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Permissions */}
      <Dialog
        open={permissionsRole !== null}
        onOpenChange={(open) => !open && setPermissionsRole(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Manage Permissions - {permissionsRole?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {PERMISSIONS.map((permission) => (
              <label
                key={permission}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm"
              >
                <Checkbox
                  checked={checkedPermissions.has(permission)}
                  onCheckedChange={() => togglePermission(permission)}
                />
                {permission}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsRole(null)} disabled={permissionsSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitPermissions} disabled={permissionsSubmitting}>
              {permissionsSubmitting ? "Saving…" : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteRole !== null}
        onOpenChange={(open) => !open && setDeleteRole(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete role &quot;{deleteRole?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the role and its permission configuration. Users
              currently assigned this role will need to be reassigned. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
