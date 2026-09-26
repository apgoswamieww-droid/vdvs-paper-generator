"use client";

import { useState } from "react";
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
import { GraduationCap, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { createClass, deleteClass } from "./actions";
import type { ClassLevelRow } from "./page";

export function ClassesClient({
  classes,
  auditSchoolId,
}: {
  classes: ClassLevelRow[];
  auditSchoolId: string | null;
}) {
  const router = useRouter();
  const { confirm, confirmElement, confirmReset } = useConfirm();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const result = await createClass({ name, schoolId: auditSchoolId ?? undefined });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not create the class.");
      return;
    }
    toast.success(`Class ${name} created.`);
    setName("");
    setOpen(false);
    router.refresh();
  }

  async function handleDelete(c: ClassLevelRow) {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description:
        "Only classes without any subjects can be removed. Students stay in the school but lose their class assignment.",
    });
    if (!ok) return;
    setDeletingId(c.id);
    const result = await deleteClass({ classId: c.id, schoolId: auditSchoolId ?? undefined });
    confirmReset();
    setDeletingId(null);
    if (result.success) {
      toast.success("Class deleted.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not delete the class.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">Classes & Sections</h1>
          <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
            Academic levels used to organise students and curriculum.
          </p>
        </div>
        <Button className="gap-2 font-[Nunito]" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Class
        </Button>
      </div>

      {auditSchoolId && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Audit mode — viewed as a super admin.
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">
            All Classes ({classes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Class</TableHead>
                  <TableHead className="text-center">Students</TableHead>
                  <TableHead className="w-16 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                      <GraduationCap className="mx-auto mb-2 h-6 w-6 opacity-40" />
                      No classes yet — click “Add Class” to get started.
                    </TableCell>
                  </TableRow>
                )}
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-[Nunito] text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {c.students}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete class"
                        className="text-red-400 hover:text-red-300"
                        disabled={deletingId === c.id}
                        onClick={() => void handleDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Class</DialogTitle>
            <DialogDescription>
              Add a new academic level, e.g. “Std 8” or “Class 10 A”.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="class-name">Class Name *</Label>
              <Input
                id="class-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Std 8"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="font-[Nunito]">
                {busy ? "Creating…" : "Create class"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {confirmElement}
    </div>
  );
}