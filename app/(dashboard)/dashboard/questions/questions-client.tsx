"use client";

// ============================================================
//  Question Bank client — advanced data table
//
//  Filters (search, taxonomy cascade, type, difficulty, bloom,
//  PYQ), server-side pagination via listQuestions(), and
//  add/edit/delete through the question form dialog.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { listQuestions, deleteQuestion, type QuestionListDTO, type TaxonomyNode } from "./actions";
import type { PaginatedResponse } from "@/types";
import type { QuestionFilterInput } from "@/lib/validations";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuestionFormDialog } from "./question-form-dialog";
import { ImportDialog } from "./import/import-dialog";
import { cn } from "cn";

type Filters = Partial<QuestionFilterInput>;

const DIFFICULTY_STYLES: Record<string, string> = {
  EASY: "bg-emerald-500/15 text-emerald-400",
  MEDIUM: "bg-amber-500/15 text-amber-400",
  HARD: "bg-red-500/15 text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  SHORT_ANSWER: "Short",
  LONG_ANSWER: "Long",
  TRUE_FALSE: "T/F",
  FILL_IN_THE_BLANK: "Fill blank",
  MATCH_THE_FOLLOWING: "Match",
  CASE_STUDY: "Case study",
};

const BLOOM_LEVELS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"];
const QUESTION_TYPES = Object.keys(TYPE_LABELS);
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

export function QuestionsClient({
  initialData,
  tree,
}: {
  initialData: PaginatedResponse<QuestionListDTO>;
  tree: TaxonomyNode[];
}) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: 20 });
  const [searchInput, setSearchInput] = useState("");
  const [classId, setClassId] = useState("");
  const [isPending, startTransition] = useTransition();
  const firstRun = useRef(true);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionDetailLite | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const fetchPage = useCallback((f: Filters) => {
    startTransition(async () => {
      const res = await listQuestions(f);
      setData(res);
    });
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    fetchPage(filters);
  }, [filters, fetchPage]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (searchInput === (f.search ?? "") ? f : { ...f, search: searchInput, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Taxonomy cascade options
  const subjects = useMemo(() => tree.find((c) => c.id === classId)?.children ?? [], [tree, classId]);
  const chapters = useMemo(
    () => subjects.find((s) => s.id === filters.subjectId)?.children ?? [],
    [subjects, filters.subjectId]
  );
  const topics = useMemo(
    () => chapters.find((c) => c.id === filters.chapterId)?.children ?? [],
    [chapters, filters.chapterId]
  );

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  const refetch = () => fetchPage(filters);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await deleteQuestion(id);
    refetch();
  };

  const { items, meta } = data;
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="space-y-4">
      {/* ------- Toolbar ------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Add Question
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          ⬆ Import .docx
        </Button>
        <div className="ml-auto">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search text, tags, years…"
            className="w-64 bg-slate-900"
          />
        </div>
      </div>

      {/* ------- Filters ------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <SelectFilter
          placeholder="Class"
          value={classId || null}
          onChange={(v) => {
            setClassId(v ?? "");
            setFilters((f) => ({ ...f, subjectId: "", chapterId: "", topicId: "", page: 1 }));
          }}
          items={tree.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SelectFilter
          placeholder="Subject"
          value={filters.subjectId || null}
          onChange={(v) => setFilters((f) => ({ ...f, subjectId: v ?? "", chapterId: "", topicId: "", page: 1 }))}
          items={subjects.map((s) => ({ value: s.id, label: s.name }))}
          disabled={!classId}
        />
        <SelectFilter
          placeholder="Chapter"
          value={filters.chapterId || null}
          onChange={(v) => setFilters((f) => ({ ...f, chapterId: v ?? "", topicId: "", page: 1 }))}
          items={chapters.map((c) => ({ value: c.id, label: c.name }))}
          disabled={!filters.subjectId}
        />
        <SelectFilter
          placeholder="Topic"
          value={filters.topicId || null}
          onChange={(v) => setFilter("topicId", v ?? "")}
          items={topics.map((t) => ({ value: t.id, label: t.name }))}
          disabled={!filters.chapterId}
        />
        <span className="mx-1 h-5 w-px bg-slate-700" />
        <SelectFilter
          placeholder="Type"
          value={(filters.questionType as string) || null}
          onChange={(v) => setFilter("questionType", (v ?? undefined) as Filters["questionType"])}
          items={QUESTION_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
        />
        <SelectFilter
          placeholder="Difficulty"
          value={(filters.difficulty as string) || null}
          onChange={(v) => setFilter("difficulty", (v ?? undefined) as Filters["difficulty"])}
          items={DIFFICULTIES.map((d) => ({ value: d, label: d[0] + d.slice(1).toLowerCase() }))}
        />
        <SelectFilter
          placeholder="Bloom"
          value={(filters.bloomLevel as string) || null}
          onChange={(v) => setFilter("bloomLevel", (v ?? undefined) as Filters["bloomLevel"])}
          items={BLOOM_LEVELS.map((b) => ({ value: b, label: b[0] + b.slice(1).toLowerCase() }))}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSearchInput("");
            setClassId("");
            setFilters({ page: 1, pageSize: 20 });
          }}
        >
          Reset
        </Button>
      </div>

      {/* ------- Table ------- */}
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Question</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Difficulty</th>
              <th className="px-3 py-3 font-medium">Marks</th>
              <th className="px-3 py-3 font-medium">Bloom</th>
              <th className="px-3 py-3 font-medium">Scope</th>
              <th className="px-3 py-3 font-medium">Added</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className={cn("divide-y divide-slate-800 bg-slate-900/50", isPending && "opacity-50 transition")}>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  No questions match these filters.
                </td>
              </tr>
            )}
            {items.map((q) => (
              <tr key={q.id} className="group hover:bg-slate-900">
                <td className="max-w-sm px-4 py-3">
                  <div className="line-clamp-2 text-slate-200">
                    <KaTeXRenderer text={q.questionText} />
                  </div>
                  {q.previousYearTag && (
                    <Badge variant="outline" className="mt-1 text-[10px] text-blue-400">
                      {q.previousYearTag}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Badge variant="secondary">{TYPE_LABELS[q.questionType] ?? q.questionType}</Badge>
                </td>
                <td className="px-3 py-3">
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", DIFFICULTY_STYLES[q.difficulty])}>
                    {q.difficulty[0] + q.difficulty.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-300">{q.marks}</td>
                <td className="px-3 py-3 text-xs text-slate-400">
                  {q.bloomLevel ? q.bloomLevel[0] + q.bloomLevel.slice(1).toLowerCase() : "—"}
                </td>
                <td className="px-3 py-3 text-xs text-slate-400">
                  {q.subject?.name ?? "—"}
                  {q.chapter ? <span className="block text-slate-600">{q.chapter.name}</span> : null}
                </td>
                <td className="px-3 py-3 text-xs text-slate-500">
                  {new Date(q.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Edit question"
                      onClick={async () => {
                        const { getQuestionById } = await import("./actions");
                        const detail = await getQuestionById(q.id);
                        if (detail) {
                          setEditing(detail);
                          setFormOpen(true);
                        }
                      }}
                    >
                      ✎
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Delete question" onClick={() => onDelete(q.id)}>
                      ✕
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------- Pagination ------- */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          Showing <b className="text-slate-200">{from}</b>–<b className="text-slate-200">{to}</b> of{" "}
          <b className="text-slate-200">{meta.total}</b>
        </span>
        <div className="flex items-center gap-2">
          <SelectFilter
            placeholder="20 / page"
            value={String(filters.pageSize ?? 20)}
            onChange={(v) => setFilter("pageSize", v ? Number(v) : 20)}
            items={[10, 20, 50].map((n) => ({ value: String(n), label: `${n} / page` }))}
          />
          <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>
            ← Prev
          </Button>
          <span className="px-1 text-slate-300">
            {meta.page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page >= meta.totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next →
          </Button>
        </div>
      </div>

      {/* ------- Dialogs ------- */}
      <QuestionFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        tree={tree}
        onSaved={refetch}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        tree={tree}
        onImported={refetch}
      />
    </div>
  );
}

type QuestionDetailLite = Awaited<ReturnType<typeof import("./actions").getQuestionById>>;

// ------------------------------------------------------------
//  Small select wrapper for filters
// ------------------------------------------------------------

function SelectFilter({
  placeholder,
  value,
  onChange,
  items,
  disabled,
}: {
  placeholder: string;
  value: string | null;
  onChange: (v: string | null) => void;
  items: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => onChange(typeof v === "string" ? v : null)}
      disabled={disabled}
    >
      <SelectTrigger className="min-w-32 bg-slate-950" size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
