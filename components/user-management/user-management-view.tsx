"use client";

import { useEffect, useState } from "react";
import { usePolling } from "@/lib/use-polling";
import { MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BASE_ROLES, scopeFieldFor } from "@/lib/rbac";
import {
  roleByName,
  roleSlugFromName,
  scopeBodyKey,
  scopeOptionsFor,
} from "@/components/user-management/user-form-shared";
import { CreateUserDialog } from "@/components/user-management/create-user-page";
import { useSession } from "@/lib/session";
import { Label } from "@/components/ui/label";
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

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleName: string;
  stateName: string;
  districtName: string;
  hostOrgName: string;
  kvkName: string;
  createdAt: string;
  lastLogin: string | null;
};

type EditFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  roleName: string;
  scopeValue: string;
};
const EMPTY_EDIT_FORM: EditFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  roleName: "",
  scopeValue: "",
};

/** Picks whichever scope name the user row already carries, matching the given role's own scope kind - same convention as the create form's scopeBodyKey. */
function currentScopeValue(user: UserRow, kind: ReturnType<typeof scopeFieldFor>) {
  if (!kind) return "";
  switch (kind.kind) {
    case "state":
      return user.stateName;
    case "district":
      return user.districtName;
    case "organisation":
      return user.hostOrgName;
    case "kvk":
      return user.kvkName;
    default:
      return "";
  }
}

/**
 * User Management screen, wired to the real /api/users CRUD - list, create
 * (its own dedicated page, see create-user-page.tsx), edit, and delete all
 * round-trip through Prisma now instead of the earlier hardcoded empty
 * state. Reset Password reuses the same edit endpoint (a password-only
 * PATCH), since it's the same underlying action a real admin can already do
 * from Edit User - no separate backend needed for it.
 */
export function UserManagementView() {
  const session = useSession();
  const isSuperAdmin = session.role === "super-admin";
  const [search, setSearch] = useState("");
  /** Debounced so typing doesn't fire a request per keystroke - the search box only queries the server 350ms after the user stops typing. */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** 10 rows per page, matching the reference "View Users" table. */
  const PAGE_SIZE = 10;

  /** `silent` skips the loading state - used for background polling refreshes so the table doesn't flash "Loading users..." over data that's already on screen. Search + pagination now happen server-side (see /api/users) so this only ever fetches the current page's 10 rows, not the whole scope every time. */
  function loadUsers(silent = false) {
    if (!silent) setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    fetch(`/api/users?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { users: UserRow[]; total: number }) => {
        setUsers(data.users);
        setTotal(data.total);
        setListError(null);
      })
      .catch(() => {
        if (!silent) setListError("Could not load users.");
      })
      .finally(() => setLoading(false));
  }

  // Debounce the search box - waits 350ms after typing stops before it becomes the query actually sent to the server.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => loadUsers(), [page, debouncedSearch]);
  usePolling(() => loadUsers(true));

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = users;

  function openEdit(user: UserRow) {
    setEditUser(user);
    const role = roleByName(user.roleName);
    const scopeField = role ? scopeFieldFor(role.scope) : null;
    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: "",
      roleName: user.roleName,
      scopeValue: currentScopeValue(user, scopeField),
    });
    setEditError(null);
  }

  const editRole = roleByName(editForm.roleName);
  const editScopeField = editRole ? scopeFieldFor(editRole.scope) : null;
  const editScopeOptions = scopeOptionsFor(editScopeField);

  function onEditRoleChange(roleName: string) {
    setEditForm((prev) => ({ ...prev, roleName, scopeValue: "" }));
  }

  async function submitEdit() {
    if (!editUser) return;
    if (!editForm.name.trim()) {
      setEditError("Name is required.");
      return;
    }
    if (isSuperAdmin && editScopeField && !editForm.scopeValue) {
      setEditError(`${editScopeField.label} is required for this role.`);
      return;
    }
    setEditError(null);
    setEditSubmitting(true);
    try {
      const response = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          ...(editForm.password ? { password: editForm.password } : {}),
          ...(isSuperAdmin ? { roleSlug: roleSlugFromName(editForm.roleName) } : {}),
          ...(isSuperAdmin && editScopeField && scopeBodyKey(editScopeField.kind)
            ? { [scopeBodyKey(editScopeField.kind)!]: editForm.scopeValue }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setEditError(data.error ?? "Could not save changes.");
        return;
      }
      setEditUser(null);
      loadUsers();
    } catch {
      setEditError("Could not reach the server. Please try again.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const response = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setDeleteError(data.error ?? "Could not delete this user.");
        return;
      }
      setDeleteUser(null);
      loadUsers();
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
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search by name or email..."
            className="h-10 w-96 pl-9"
          />
        </div>
        <Button size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create User
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TableHead className="px-4 py-3">Name</TableHead>
            <TableHead className="px-4 py-3">Email</TableHead>
            <TableHead className="px-4 py-3">Phone</TableHead>
            <TableHead className="px-4 py-3">Role</TableHead>
            <TableHead className="px-4 py-3">Created</TableHead>
            <TableHead className="px-4 py-3">Last Login</TableHead>
            <TableHead className="w-20 px-4 py-3 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                Loading users...
              </TableCell>
            </TableRow>
          ) : listError ? (
            <TableRow>
              <TableCell colSpan={6} className="px-4 py-16 text-center text-destructive">
                {listError}
              </TableCell>
            </TableRow>
          ) : pageRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="px-4 py-3 font-medium text-foreground">{user.name}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{user.email || "-"}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{user.phone || "-"}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{user.roleName}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "-"}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm">
                          <MoreVertical className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-max min-w-40 whitespace-nowrap">
                      <DropdownMenuItem onClick={() => openEdit(user)}>
                        <Pencil className="size-3.5" />
                        Edit User
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setDeleteUser(user);
                          setDeleteError(null);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <span>
          Showing {total === 0 ? 0 : currentPage * PAGE_SIZE + 1} to{" "}
          {currentPage * PAGE_SIZE + pageRows.length} of {total} entries
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Create User */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => loadUsers()}
      />

      {/* Edit User */}
      <Dialog open={editUser !== null} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-primary">Full Name</Label>
              <Input
                id="edit-name"
                className="h-10"
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-primary">Email</Label>
              <Input
                id="edit-email"
                className="h-10"
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone" className="text-primary">Phone Number (Optional)</Label>
              <Input
                id="edit-phone"
                className="h-10"
                value={editForm.phone}
                onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-password" className="text-primary">New Password (Optional)</Label>
              <Input
                id="edit-password"
                className="h-10"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep current password"
                value={editForm.password}
                onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Setting a new password logs the user out everywhere.
              </p>
            </div>

            {isSuperAdmin && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-role" className="text-primary">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select value={editForm.roleName} onValueChange={(value) => onEditRoleChange(value as string)}>
                  <SelectTrigger id="edit-role" className="h-10 w-full">
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
              </div>
            )}

            {isSuperAdmin && editScopeField && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-scope" className="text-primary">
                  {editScopeField.label} <span className="text-destructive">*</span>
                </Label>
                {editScopeOptions ? (
                  <Select
                    value={editForm.scopeValue}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, scopeValue: value as string }))}
                  >
                    <SelectTrigger id="edit-scope" className="h-10 w-full">
                      <SelectValue placeholder={editScopeField.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {editScopeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="edit-scope"
                    className="h-10"
                    placeholder={editScopeField.placeholder}
                    value={editForm.scopeValue}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, scopeValue: event.target.value }))}
                  />
                )}
              </div>
            )}
          </div>

          {editError && <p className="text-sm text-destructive">{editError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={editSubmitting}>
              {editSubmitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteUser !== null} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user &quot;{deleteUser?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account and login access. This cannot be undone.
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
