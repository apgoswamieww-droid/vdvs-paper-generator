"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Pencil,
  KeyRound,
  Trash2,
  Plus,
  Search,
  ShieldAlert,
  Copy,
  Check,
  Users,
} from "lucide-react";
import { createUser, deleteUser, resetUserPassword, updateUser } from "./actions";
import type { AdminUserRow } from "./page";

type ClassOption = { id: string; name: string };

const ROLE_LABELS: Record<string, string> = {
  TEACHER: "Teacher",
  STUDENT: "Student",
};

function RolePill({ role }: { role: string }) {
  const isTeacher = role === "TEACHER";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        isTeacher
          ? "bg-violet-500/10 text-violet-400 ring-violet-500/30"
          : "bg-sky-500/10 text-sky-400 ring-sky-500/30"
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "STUDENT", classLevelId: "" };

export function UsersClient({
  users,
  classes,
  schoolName,
  isAudit,
  auditSchoolId,
}: {
  users: AdminUserRow[];
  classes: ClassOption[];
  schoolName: string;
  isAudit: boolean;
  auditSchoolId: string;
}) {
  const router = useRouter();
  const { confirm, confirmElement, confirmReset } = useConfirm();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"ALL" | "TEACHER" | "STUDENT">("ALL");

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  // Reset dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (tab !== "ALL" && u.role !== tab) return false;
      if (!q) return true;
      return (
        (u.name ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, query, tab]);

  function initials(name: string | null) {
    const parts = (name ?? "?").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const result = await createUser({
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      classLevelId: form.role === "STUDENT" ? form.classLevelId || null : null,
      schoolId: isAudit ? auditSchoolId : undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not create the user.");
      return;
    }
    toast.success(`${ROLE_LABELS[form.role]} created.`);
    resetForm();
    setAddOpen(false);
    router.refresh();
  }

  function openEdit(u: AdminUserRow) {
    setEditing(u);
    setEditForm({
      name: u.name ?? "",
      email: u.email,
      password: "",
      role: u.role,
      classLevelId: classes.find((c) => c.name === u.className)?.id ?? "",
    });
    setEditOpen(true);
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    const result = await updateUser({
      userId: editing.id,
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
      classLevelId: editForm.role === "STUDENT" ? editForm.classLevelId || null : null,
      schoolId: isAudit ? auditSchoolId : undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not update the user.");
      return;
    }
    toast.success("User updated.");
    setEditOpen(false);
    router.refresh();
  }

  function openReset(u: AdminUserRow) {
    setResetTarget(u);
    setTempPassword("");
    setCopied(false);
    setResetOpen(true);
  }

  async function handleReset() {
    if (!resetTarget) return;
    setResetting(true);
    const result = await resetUserPassword({
      userId: resetTarget.id,
      schoolId: isAudit ? auditSchoolId : undefined,
    });
    setResetting(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not reset the password.");
      return;
    }
    setTempPassword(result.tempPassword ?? "");
    toast.success("Password reset. Copy the temporary password.");
  }

  async function copyTemp() {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete(u: AdminUserRow) {
    const ok = await confirm({
      title: `Delete ${u.name ?? u.email}?`,
      description:
        "This permanently removes the account. Papers or imports created by a teacher are kept on record.",
    });
    if (!ok) return;
    const result = await deleteUser({ userId: u.id, schoolId: isAudit ? auditSchoolId : undefined });
    confirmReset();
    if (result.success) {
      toast.success("User deleted.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not delete the user.");
    }
  }

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: "ALL", label: `All (${users.length})` },
    { key: "TEACHER", label: `Teachers (${users.filter((u) => u.role === "TEACHER").length})` },
    { key: "STUDENT", label: `Students (${users.filter((u) => u.role === "STUDENT").length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">Users & Staff</h1>
          <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
            Teachers and students belonging to {schoolName}.
          </p>
        </div>
        <Button className="gap-2 font-[Nunito]" onClick={() => { resetForm(); setAddOpen(true); }}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {isAudit && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Audit mode — view-only scoping into <strong className="font-semibold">{schoolName}</strong>.
        </div>
      )}

      {/* Toolbar */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="font-[Rasa] text-lg font-semibold">All Users</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-md px-3 py-1.5 font-[Nunito] text-xs font-medium transition-colors ${
                    tab === t.key
                      ? "bg-secondary text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Class / Section</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <Users className="mx-auto mb-2 h-6 w-6 opacity-40" />
                      {users.length === 0
                        ? "No users yet — click “Add User” to create your first teacher or student."
                        : "No users match the current search and filter."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/20 text-[10px] font-bold">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-[Nunito] text-sm font-medium">{u.name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <RolePill role={u.role} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.role === "STUDENT" ? (u.className ?? "—") : "—"}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <span className="text-xs font-medium text-emerald-400">Active</span>
                      ) : (
                        <span className="text-xs font-medium text-red-400">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Edit"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Reset password" onClick={() => openReset(u)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => void handleDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Add User dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Registers a teacher or student under {schoolName}. Students can be assigned to a class.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full Name *</Label>
              <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email *</Label>
              <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@school.edu" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="u-password">Password *</Label>
                <Input id="u-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 characters" minLength={8} required />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Select
                  items={[
                    { value: "TEACHER", label: "Teacher" },
                    { value: "STUDENT", label: "Student" },
                  ]}
                  value={form.role}
                  onValueChange={(v) =>
                    setForm({ ...form, role: typeof v === "string" ? v : "STUDENT" })
                  }
                >
                  <SelectTrigger className="w-full bg-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEACHER">Teacher</SelectItem>
                    <SelectItem value="STUDENT">Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.role === "STUDENT" && (
              <div className="space-y-1.5">
                <Label>Class / Section (optional)</Label>
                <Select
                  items={classes.map((c) => ({ value: c.id, label: c.name }))}
                  value={form.classLevelId || null}
                  onValueChange={(v) => setForm({ ...form, classLevelId: typeof v === "string" ? v : "" })}
                >
                  <SelectTrigger className="w-full bg-slate-950">
                    <SelectValue placeholder="No class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="font-[Nunito]">
                {submitting ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update details for this {editing ? ROLE_LABELS[editing.role] : "user"}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Full Name *</Label>
              <Input id="e-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email *</Label>
              <Input id="e-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select
                items={[
                  { value: "TEACHER", label: "Teacher" },
                  { value: "STUDENT", label: "Student" },
                ]}
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: typeof v === "string" ? v : "STUDENT" })}
              >
                <SelectTrigger className="w-full bg-slate-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEACHER">Teacher</SelectItem>
                  <SelectItem value="STUDENT">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.role === "STUDENT" && (
              <div className="space-y-1.5">
                <Label>Class / Section (optional)</Label>
                <Select
                  items={classes.map((c) => ({ value: c.id, label: c.name }))}
                  value={editForm.classLevelId || null}
                  onValueChange={(v) => setEditForm({ ...editForm, classLevelId: typeof v === "string" ? v : "" })}
                >
                  <SelectTrigger className="w-full bg-slate-950">
                    <SelectValue placeholder="No class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="font-[Nunito]">
                {submitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reset password dialog ── */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Generate a new temporary password for {resetTarget?.name ?? "this user"}. The user must
              change it after signing in.
            </DialogDescription>
          </DialogHeader>
          {tempPassword ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
                <p className="font-[Nunito] text-sm font-semibold text-emerald-300">
                  Temporary password (shown once):
                </p>
                <p className="mt-2 rounded-md bg-slate-950 px-3 py-2 font-mono text-lg text-emerald-300">
                  {tempPassword}
                </p>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5 font-[Nunito] text-xs" onClick={() => void copyTemp()}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setResetOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
                Cancel
              </Button>
              <Button onClick={() => void handleReset()} disabled={resetting} className="font-[Nunito]">
                {resetting ? "Generating…" : "Generate password"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {confirmElement}
    </div>
  );
}