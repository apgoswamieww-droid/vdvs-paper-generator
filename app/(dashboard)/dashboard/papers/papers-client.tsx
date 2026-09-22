"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Search, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { ConfirmDialog, showResultToast, showErrorToast } from "@/components/shared";
import { listPapers, deletePaper, type PaperListDTO } from "./actions";
import type { PaginatedResponse } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  PUBLISHED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  ARCHIVED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const MODE_COLORS: Record<string, string> = {
  MANUAL: "bg-primary/15 text-primary border-primary/20",
  BLUEPRINT: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

export function PapersClient({
  initialData,
}: {
  initialData: PaginatedResponse<PaperListDTO>;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<PaperListDTO | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  async function fetchPapers(page = 1) {
    startTransition(async () => {
      const result = await listPapers({
        search: search || undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        page,
        pageSize: 20,
      });
      setData(result);
    });
  }

  async function handleDelete(paper: PaperListDTO) {
    setDeletePending(true);
    try {
      const result = await deletePaper(paper.id);
      showResultToast(result, { successMessage: "Paper deleted.", errorMessage: "Could not delete the paper." });
      if (result.success) {
        setDeleteTarget(null);
        fetchPapers(data.meta.page);
      }
    } catch {
      showErrorToast();
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search papers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPapers()}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v ?? "ALL");
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => fetchPapers()} disabled={isPending}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="text-center">Marks</TableHead>
                <TableHead className="text-center">Questions</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No papers found. Create your first paper to get started.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((paper) => (
                  <TableRow
                    key={paper.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/dashboard/papers/${paper.id}`)
                    }
                  >
                    <TableCell className="font-medium">
                      {paper.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {paper.subject?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {paper.totalMarks}
                    </TableCell>
                    <TableCell className="text-center">
                      {paper._count.totalQuestions}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={MODE_COLORS[paper.generationMode]}
                      >
                        {paper.generationMode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[paper.status]}
                      >
                        {paper.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(paper.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(paper);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {data.meta.page} of {data.meta.totalPages} ({data.meta.total} papers)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.meta.page <= 1}
                onClick={() => fetchPapers(data.meta.page - 1)}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.meta.page >= data.meta.totalPages}
                onClick={() => fetchPapers(data.meta.page + 1)}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this paper?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" and all its sections will be permanently deleted. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        loading={deletePending}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}
