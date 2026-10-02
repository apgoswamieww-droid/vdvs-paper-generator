import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  HelpCircle,
  ClipboardList,
  ClipboardCheck,
  PenLine,
  BookOpen,
  Plus,
  ArrowRight,
  TrendingUp,
  Layers,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { formatDateISO } from "@/lib/utils";
import { getTeacherDashboard } from "./dashboard-data";

export const metadata: Metadata = {
  title: "Teacher Dashboard",
  description: "Your subjects, papers, review queue and grading at a glance.",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  PUBLISHED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  ARCHIVED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  SCHEDULED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  CLOSED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const DIFFICULTY_META: Record<string, { label: string; bar: string; text: string }> = {
  EASY: { label: "Easy", bar: "bg-emerald-500", text: "text-emerald-400" },
  MEDIUM: { label: "Medium", bar: "bg-amber-500", text: "text-amber-400" },
  HARD: { label: "Hard", bar: "bg-rose-500", text: "text-rose-400" },
};

const DIFFICULTY_ORDER = ["EASY", "MEDIUM", "HARD"] as const;

export default async function TeacherDashboardPage() {
  const session = await requireSession();
  if (session.role !== "TEACHER") redirect("/dashboard");

  const data = await getTeacherDashboard();
  const totalBank = data.difficultyMix.reduce((sum, s) => sum + s.count, 0);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">
            {greeting}, {data.teacherName}
          </h1>
          <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
            {data.subjectsCount > 0
              ? `You teach ${data.subjectsCount} subject${data.subjectsCount === 1 ? "" : "s"}. Here's your paper-generation activity.`
              : "No subjects assigned yet — ask your school admin to assign you subjects."}
          </p>
        </div>
        <Link href="/dashboard/papers/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Paper
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "My Papers",
            value: data.stats.myPapers,
            icon: FileText,
            href: "/dashboard/papers",
            color: "text-secondary",
            bg: "bg-secondary/10",
          },          {
            label: "Bank Questions",
            value: data.stats.bankQuestions,
            icon: HelpCircle,
            href: "/dashboard/questions",
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
          },
          {
            label: "Pending Review",
            value: data.stats.pendingReview,
            icon: ClipboardCheck,
            href: "/dashboard/teacher/questions/review",
            color: "text-rose-400",
            bg: "bg-rose-500/10",
          },
          {
            label: "Active Assignments",
            value: data.stats.activeAssignments,
            icon: ClipboardList,
            href: "/dashboard/teacher/assignments",
            color: "text-violet-400",
            bg: "bg-violet-500/10",
          },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="border-border/50 transition-colors hover:border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-[Nunito] text-sm font-medium text-muted-foreground">{s.label}</p>
                    <p className="font-[Rasa] mt-2 text-3xl font-bold tracking-tight">{s.value}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.bg}`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Analytics row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Difficulty mix */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Question Bank by Difficulty
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {totalBank === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No questions in your subjects yet.
              </p>
            ) : (
              DIFFICULTY_ORDER.map((d) => {
                const slice = data.difficultyMix.find((s) => s.difficulty === d);
                const count = slice?.count ?? 0;
                const pct = totalBank ? Math.round((count / totalBank) * 100) : 0;
                const meta = DIFFICULTY_META[d];
                return (
                  <div key={d}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{meta.label}</span>
                      <span className={meta.text}>
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top chapters */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Top Chapters by Bank Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topChapters.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Add chapter questions to see insights here.
              </p>
            ) : (
              <div className="space-y-2">
                {data.topChapters.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="font-[Rasa] w-5 text-sm font-bold text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{c.count} Qs</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{
                            width: `${Math.max(6, Math.round((c.count / (data.topChapters[0]?.count || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grading summary */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              Grading Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="font-[Rasa] text-3xl font-bold">
                {data.grading.averagePercent !== null ? `${data.grading.averagePercent}%` : "—"}
              </span>
              <span className="text-sm text-muted-foreground">average graded score</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.grading.gradedSubmissions > 0
                ? `Across ${data.grading.gradedSubmissions} graded submission${data.grading.gradedSubmissions === 1 ? "" : "s"} in your assignments.`
                : "Grade submissions to see the class average here."}
            </p>
            <Link href="/dashboard/teacher/grading">
              <Button variant="outline" size="sm" className="gap-2">
                Go to grading
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Lists row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent assignments */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] text-lg font-semibold">Recent Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {data.assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/50">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">No assignments yet.</p>
                <Link href="/dashboard/teacher/assignments/new">
                  <Button variant="outline" size="sm" className="mt-3 gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    New assignment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {data.assignments.map((a) => {
                  const pct =
                    a.totalSubmissions > 0
                      ? Math.round((a.submittedCount / a.totalSubmissions) * 100)
                      : 0;
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{a.title}</span>
                          <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_BADGE[a.status] ?? ""}`}>
                            {a.status}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.className} · {a.paperTitle}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{pct}%</p>
                        <p className="text-[10px] text-muted-foreground">submitted</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent papers */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] text-lg font-semibold">Recent Papers</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentPapers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/50">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  No papers in your subjects yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {data.recentPapers.map((p) => (
                  <Link key={p.id} href={`/dashboard/papers/${p.id}`} className="block">
                    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{p.title}</span>
                          <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_BADGE[p.status] ?? ""}`}>
                            {p.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.subjectName} · {formatDateISO(p.createdAt)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My subjects */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
            <Layers className="h-4 w-4 text-muted-foreground" />
            My Subjects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.subjects.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No subjects assigned yet — ask your school admin to assign you subjects.
            </p>
            ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.subjects.map((s) => (
                <div key={s.id} className="rounded-lg border border-border/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{s.name}</span>
                    {s.className && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {s.className}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle className="h-3.5 w-3.5" />
                      {s.questionCount} questions
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {s.paperCount} papers
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
