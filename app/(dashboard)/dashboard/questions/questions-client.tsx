"use client";

// ============================================================
//  Question Bank client — advanced data table (Dark-Only Refactor)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listQuestions,
  deleteQuestion,
  type QuestionListDTO,
  type TaxonomyNode,
} from "./actions";
import type { PaginatedResponse } from "@/types";
import type { QuestionFilterInput } from "@/lib/validations";
import { MEDIUMS } from "@/lib/validations";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog, showResultToast, showErrorToast } from "@/components/shared";
import { Plus, Upload, Search, X, Pencil, Trash2, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { ImportDialog } from "./import/import-dialog";
import { QuestionDetailDialog } from "./question-detail-dialog";

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
  NUMERIC: "Numeric",
};

const BLOOM_LEVELS = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
];
const QUESTION_TYPES = Object.keys(TYPE_LABELS);
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const MEDIUM_LABELS: Record<string, string> = {
  ENGLISH: "English",
  GUJARATI: "Gujarati",
};

export function QuestionsClient({
  initialData,
  tree,
}: {
  initialData: PaginatedResponse<QuestionListDTO>;
  tree: TaxonomyNode[];
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: 20 });
  const [searchInput, setSearchInput] = useState("");
  const [classId, setClassId] = useState("");
  const [isPending, startTransition] = useTransition();
  const firstRun = useRef(true);

  // Dialog state
  const [importOpen, setImportOpen] = useState(false);

  // Question details modal state
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<QuestionListDTO | null>(null);
  const [deletePending, setDeletePending] = useState(false);

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
      setFilters((f) =>
        searchInput === (f.search ?? "")
          ? f
          : { ...f, search: searchInput, page: 1 }
      );
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Taxonomy cascade
  const subjects = useMemo(
    () => tree.find((c) => c.id === classId)?.children ?? [],
    [tree, classId]
  );
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

  const onDelete = async (q: QuestionListDTO) => {
    setDeletePending(true);
    try {
      const res = await deleteQuestion(q.id);
      showResultToast(res, { successMessage: "Question deleted.", errorMessage: "Could not delete the question." });
      if (res.success) {
        setDeleteTarget(null);
        refetch();
      }
    } catch {
      showErrorToast();
    } finally {
      setDeletePending(false);
    }
  };

  const { items, meta } = data;
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="space-y-4">
      {/* ------- Toolbar ------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => router.push("/dashboard/questions/new")} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Question
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
          <Upload className="h-4 w-4" />
          Import .docx
        </Button>
        <div className="ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search text, tags, years..."
              className="pl-9 w-64"
            />
          </div>
        </div>
      </div>

      {/* ------- Filters ------- */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SelectFilter
              placeholder="Medium"
              value={(filters.medium as string) || null}
              onChange={(v) =>
                setFilter(
                  "medium",
                  (v ?? undefined) as Filters["medium"]
                )
              }
              items={MEDIUMS.map((m) => ({
                value: m,
                label: MEDIUM_LABELS[m],
              }))}
            />
            <SelectFilter
              placeholder="Class"
              value={classId || null}
              onChange={(v) => {
                setClassId(v ?? "");
                setFilters((f) => ({
                  ...f,
                  subjectId: "",
                  chapterId: "",
                  topicId: "",
                  page: 1,
                }));
              }}
              items={tree.map((c) => ({ value: c.id, label: c.name }))}
            />
            <SelectFilter
              placeholder="Subject"
              value={filters.subjectId || null}
              onChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  subjectId: v ?? "",
                  chapterId: "",
                  topicId: "",
                  page: 1,
                }))
              }
              items={subjects.map((s) => ({ value: s.id, label: s.name }))}
              disabled={!classId}
            />
            <SelectFilter
              placeholder="Chapter"
              value={filters.chapterId || null}
              onChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  chapterId: v ?? "",
                  topicId: "",
                  page: 1,
                }))
              }
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
            <div className="h-5 w-px bg-border mx-1" />
            <SelectFilter
              placeholder="Type"
              value={(filters.questionType as string) || null}
              onChange={(v) =>
                setFilter(
                  "questionType",
                  (v ?? undefined) as Filters["questionType"]
                )
              }
              items={QUESTION_TYPES.map((t) => ({
                value: t,
                label: TYPE_LABELS[t],
              }))}
            />
            <SelectFilter
              placeholder="Difficulty"
              value={(filters.difficulty as string) || null}
              onChange={(v) =>
                setFilter(
                  "difficulty",
                  (v ?? undefined) as Filters["difficulty"]
                )
              }
              items={DIFFICULTIES.map((d) => ({
                value: d,
                label: d[0] + d.slice(1).toLowerCase(),
              }))}
            />
            <SelectFilter
              placeholder="Bloom"
              value={(filters.bloomLevel as string) || null}
              onChange={(v) =>
                setFilter(
                  "bloomLevel",
                  (v ?? undefined) as Filters["bloomLevel"]
                )
              }
              items={BLOOM_LEVELS.map((b) => ({
                value: b,
                label: b[0] + b.slice(1).toLowerCase(),
              }))}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setClassId("");
                setFilters({ page: 1, pageSize: 20 });
              }}
              className="gap-1 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------- Table ------- */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-20">ID</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Medium</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead className="text-center">Marks</TableHead>
                <TableHead>Bloom</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody className={isPending ? "opacity-50" : ""}>
              {isPending &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending && items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No questions match these filters.
                  </TableCell>
                </TableRow>
              )}
              {!isPending &&
                items.map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setViewId(q.id);
                      setViewOpen(true);
                    }}
                  >
                    <TableCell className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      #{q.code}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="line-clamp-2">
                        <KaTeXRenderer text={q.questionText} />
                      </div>
                      {q.previousYearTag && (
                        <Badge
                          variant="outline"
                          className="mt-1 text-[10px] border-primary/30 text-primary"
                        >
                          {q.previousYearTag}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px]">
                        {MEDIUM_LABELS[q.medium] ?? q.medium}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px]">
                        {TYPE_LABELS[q.questionType] ?? q.questionType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[q.difficulty]}`}
                      >
                        {q.difficulty[0] +
                          q.difficulty.slice(1).toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {q.marks}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {q.bloomLevel
                        ? q.bloomLevel[0] +
                          q.bloomLevel.slice(1).toLowerCase()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {q.subject?.name ?? "—"}
                      {q.chapter && (
                        <span className="block text-muted-foreground/60">
                          {q.chapter.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="View question details"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewId(q.id);
                            setViewOpen(true);
                          }}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Edit question"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/questions/${q.id}`);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Delete question"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(q);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ------- Pagination ------- */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing{" "}
          <span className="font-medium text-foreground">{from}</span>–
          <span className="font-medium text-foreground">{to}</span> of{" "}
          <span className="font-medium text-foreground">{meta.total}</span>
        </span>
        <div className="flex items-center gap-2">
          <SelectFilter
            placeholder="20 / page"
            value={String(filters.pageSize ?? 20)}
            onChange={(v) => setFilter("pageSize", v ? Number(v) : 20)}
            items={[10, 20, 50].map((n) => ({
              value: String(n),
              label: `${n} / page`,
            }))}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page <= 1}
            onClick={() =>
              setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
            }
            className="gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="px-2 text-foreground tabular-nums">
            {meta.page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page >= meta.totalPages}
            onClick={() =>
              setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
            }
            className="gap-1"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ------- Dialogs ------- */}
      <QuestionDetailDialog
        key={viewOpen ? (viewId ?? "closed") : "closed"}
        open={viewOpen}
        onOpenChange={setViewOpen}
        questionId={viewOpen ? viewId : null}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        tree={tree}
        onImported={refetch}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this question?"
        description={
          deleteTarget
            ? `"${deleteTarget.questionText.slice(0, 80)}${deleteTarget.questionText.length > 80 ? "…”" : ""}" will be permanently deleted.`
            : ""
        }
        confirmLabel="Delete"
        loading={deletePending}
        onConfirm={() => deleteTarget && onDelete(deleteTarget)}
      />
    </div>
  );
}

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
      <SelectTrigger className="min-w-32" size="sm">
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
