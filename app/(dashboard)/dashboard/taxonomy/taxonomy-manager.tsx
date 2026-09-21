"use client";

// ============================================================
//  Taxonomy Manager (client) — Class → Subject → Chapter → Topic
//
//  Four columns, each listing the selected parent's children
//  with add/edit/delete. Create/edit uses a small dialog that
//  calls the taxonomy Server Actions directly.
// ============================================================

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createClassLevel,
  updateClassLevel,
  deleteClassLevel,
  createSubject,
  updateSubject,
  deleteSubject,
  createChapter,
  updateChapter,
  deleteChapter,
  createTopic,
  updateTopic,
  deleteTopic,
} from "./actions";
import { getTaxonomyTree, type TaxonomyNode } from "../questions/actions";
import type { ActionState } from "@/lib/validations";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "cn";

type Entity = "class" | "subject" | "chapter" | "topic";

type DialogState =
  | { mode: "create"; entity: Entity }
  | {
      mode: "edit";
      entity: Entity;
      id: string;
      name: string;
      code?: string | null;
      order?: number;
    }
  | null;

export function TaxonomyManager({ initialTree }: { initialTree: TaxonomyNode[] }) {
  const [tree, setTree] = useState<TaxonomyNode[]>(initialTree);
  const [selected, setSelected] = useState({ classId: "", subjectId: "", chapterId: "" });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = async () => {
    setTree(await getTaxonomyTree());
    setRefreshKey((k) => k + 1);
  };

  const classes = tree;
  const subjects = useMemo(
    () => classes.find((c) => c.id === selected.classId)?.children ?? [],
    [classes, selected.classId]
  );
  const chapters = useMemo(
    () => subjects.find((s) => s.id === selected.subjectId)?.children ?? [],
    [subjects, selected.subjectId]
  );
  const topics = useMemo(
    () => chapters.find((c) => c.id === selected.chapterId)?.children ?? [],
    [chapters, selected.chapterId]
  );

  return (
    <div className="space-y-4" data-refresh={refreshKey}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Column
          title="Classes"
          items={classes}
          selectedId={selected.classId}
          onSelect={(id) => setSelected({ classId: id, subjectId: "", chapterId: "" })}
          onAdd={() => setDialog({ mode: "create", entity: "class" })}
          onEdit={(n) => setDialog({ mode: "edit", entity: "class", id: n.id, name: n.name })}
          onDelete={async (id) => {
            await deleteClassLevel(id);
            await refresh();
          }}
          emptyHint="Add Std 6 … Std 12"
        />
        <Column
          title="Subjects"
          items={subjects}
          selectedId={selected.subjectId}
          onSelect={(id) => setSelected((s) => ({ ...s, subjectId: id, chapterId: "" }))}
          onAdd={() => setDialog({ mode: "create", entity: "subject" })}
          addDisabled={!selected.classId}
          onEdit={(n) =>
            setDialog({ mode: "edit", entity: "subject", id: n.id, name: n.name, code: n.code })
          }
          onDelete={async (id) => {
            await deleteSubject(id);
            await refresh();
          }}
          emptyHint={selected.classId ? "No subjects yet" : "Select a class first"}
        />
        <Column
          title="Chapters"
          items={chapters}
          selectedId={selected.chapterId}
          onSelect={(id) => setSelected((s) => ({ ...s, chapterId: id }))}
          onAdd={() => setDialog({ mode: "create", entity: "chapter" })}
          addDisabled={!selected.subjectId}
          onEdit={(n) =>
            setDialog({ mode: "edit", entity: "chapter", id: n.id, name: n.name, order: n.order })
          }
          onDelete={async (id) => {
            await deleteChapter(id);
            await refresh();
          }}
          emptyHint={selected.subjectId ? "No chapters yet" : "Select a subject first"}
        />
        <Column
          title="Topics"
          items={topics}
          selectedId=""
          onSelect={() => {}}
          onAdd={() => setDialog({ mode: "create", entity: "topic" })}
          addDisabled={!selected.chapterId}
          onEdit={(n) =>
            setDialog({ mode: "edit", entity: "topic", id: n.id, name: n.name, order: n.order })
          }
          onDelete={async (id) => {
            await deleteTopic(id);
            await refresh();
          }}
          emptyHint={selected.chapterId ? "No topics yet" : "Select a chapter first"}
        />
      </div>

      <TaxonomyDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDone={refresh}
      />
    </div>
  );
}

// ------------------------------------------------------------
//  Column (one taxonomy level)
// ------------------------------------------------------------

function Column({
  title,
  items,
  selectedId,
  onSelect,
  onAdd,
  addDisabled,
  onEdit,
  onDelete,
  emptyHint,
}: {
  title: string;
  items: TaxonomyNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  onEdit: (node: TaxonomyNode) => void;
  onDelete: (id: string) => Promise<void>;
  emptyHint: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <Button size="xs" variant="outline" onClick={onAdd} disabled={addDisabled}>
          + Add
        </Button>
      </div>
      <ul className="min-h-40 flex-1 space-y-1 overflow-y-auto p-2">
        {items.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-slate-500">{emptyHint}</li>
        )}
        {items.map((n) => (
          <li key={n.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(n.id)}
              className={cn(
                "flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition",
                selectedId === n.id
                  ? "bg-blue-600/20 text-blue-300"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              {n.name}
              {n.code ? <span className="ml-2 text-xs text-slate-500">{n.code}</span> : null}
            </button>
            <div className="flex opacity-0 transition group-hover:opacity-100">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => onEdit(n)}
                aria-label={`Edit ${n.name}`}
              >
                ✎
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={async () => {
                  if (confirm(`Delete "${n.name}"? Its children will also be deleted.`)) {
                    await onDelete(n.id);
                  }
                }}
                aria-label={`Delete ${n.name}`}
              >
                ✕
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------
//  Create/Edit dialog
// ------------------------------------------------------------

const ENTITY_LABELS: Record<Entity, string> = {
  class: "Class",
  subject: "Subject",
  chapter: "Chapter",
  topic: "Topic",
};

function TaxonomyDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: DialogState;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    async (_prev, fd) => {
      if (!dialog) return { success: false, error: "No dialog" };

      if (dialog.mode === "create") {
        switch (dialog.entity) {
          case "class":
            return createClassLevel(null, fd);
          case "subject":
            return createSubject(null, fd);
          case "chapter":
            return createChapter(null, fd);
          case "topic":
            return createTopic(null, fd);
        }
      }

      const id = dialog.id;
      switch (dialog.entity) {
        case "class":
          return updateClassLevel(id, null, fd);
        case "subject":
          return updateSubject(id, null, fd);
        case "chapter":
          return updateChapter(id, null, fd);
        case "topic":
          return updateTopic(id, null, fd);
      }
    },
    null
  );

  useEffect(() => {
    if (state?.success) {
      void onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!dialog) return null;

  const title = `${dialog.mode === "create" ? "Add" : "Edit"} ${ENTITY_LABELS[dialog.entity]}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {dialog.entity === "class"
              ? "Classes group subjects (Std 6 … Std 12)."
              : `A ${ENTITY_LABELS[dialog.entity].toLowerCase()} lives under the selected ${
                  dialog.entity === "subject"
                    ? "class"
                    : dialog.entity === "chapter"
                      ? "subject"
                      : "chapter"
                }.`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          {dialog.mode === "edit" && dialog.entity === "subject" && (
            <div className="space-y-1.5">
              <Label htmlFor="code">Code (optional)</Label>
              <Input id="code" name="code" defaultValue={dialog.code ?? ""} placeholder="e.g. MATH" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tax-name">Name</Label>
            <Input
              id="tax-name"
              name="name"
              defaultValue={dialog.mode === "edit" ? dialog.name : ""}
              required
              autoFocus
              placeholder="e.g. Quadratic Equations"
            />
          </div>

          {dialog.entity !== "class" && (
            <div className="space-y-1.5">
              <Label htmlFor="order">Sort order</Label>
              <Input
                id="order"
                name="order"
                type="number"
                defaultValue={dialog.mode === "edit" && dialog.order !== undefined ? dialog.order : 0}
              />
            </div>
          )}

          {state && !state.success && state.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
