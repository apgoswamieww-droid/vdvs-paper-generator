import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  FileText,
  HelpCircle,
  FolderTree,
  ClipboardList,
  Sparkles,
  Plus,
  ArrowRight,
  TrendingUp,
  Layers,
  PenLine,
  Building2,
  ClipboardCheck,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { formatDateISO } from "@/lib/utils";
import { getAdminDashboard } from "./admin/dashboard-data";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "School overview — staff, papers, question bank and analytics.",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  PUBLISHED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  ARCHIVED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  SCHEDULED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  CLOSED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const PAPER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export default async function DashboardPage() {
  const session = await requireSession();

  // This is the SCHOOL_ADMIN home. Teachers, students and the platform
  // owner have their own portals — send them there.
  if (session.role !== "SCHOOL_ADMIN") {
    if (session.role === "TEACHER") redirect("/dashboard/teacher");
    if (session.role === "STUDENT") redirect("/dashboard/student");
    if (session.role === "SUPER_ADMIN") redirect("/dashboard/super-admin");
    redirect("/login");
  }

  const data = await getAdminDashboard();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const maxGrowth = Math.max(1, ...data.growth.map((g) => g.teachers + g.students));
  const totalPapers = data.stats.papers || 1;
  const aiTotal = data.aiApprovedTotal + data.aiRejectedTotal + data.pendingAiQuestions;

  const stats = [
    {
      label: "Teachers",
      value: data.stats.teachers,
      icon: Users,
      href: "/dashboard/admin/users",
      color: "text-secondary",
      bg: "bg-secondary/10",
    },
    {
      label: "Students",
      value: data.stats.students,
      icon: GraduationCap,
      href: "/dashboard/admin/users",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Papers",
      value: data.stats.papers,
      icon: FileText,
      href: "/dashboard/papers",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Question Bank",
      value: data.stats.questions,
      icon: HelpCircle,
      href: "/dashboard/questions",
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">
              {greeting}, {data.adminName}
            </h1>
            <Badge variant="outline" className="gap-1 text-[10px] uppercase">
              <Building2 className="h-3 w-3" />
              {data.planTier}
            </Badge>
          </div>
          <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
            {data.schoolName} · {data.classCount} classes · {data.subjectCount} subjects
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admin/ai-generator">
            <Button variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI Generator
            </Button>
          </Link>
          <Link href="/dashboard/papers/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Paper
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
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
        {/* Sign-up trend */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              New Teachers &amp; Students — last 6 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-4">
              {data.growth.map((g) => {
                const total = g.teachers + g.students;
                const teacherH = Math.round((g.teachers / maxGrowth) * 100);
                const studentH = Math.round((g.students / maxGrowth) * 100);
                return (
                  <div key={g.label} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{total || ""}</span>
                    <div className="flex h-full w-full max-w-14 items-end justify-center gap-1">
                      <div
                        className="w-1/2 rounded-t bg-secondary transition-all"
                        style={{ height: `${g.teachers ? Math.max(4, teacherH) : 0}%` }}
                        title={`${g.teachers} teachers`}
                      />
                      <div
                        className="w-1/2 rounded-t bg-emerald-500/70 transition-all"
                        style={{ height: `${g.students ? Math.max(4, studentH) : 0}%` }}
                        title={`${g.students} students`}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">{g.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-secondary" /> Teachers
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" /> Students
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Paper status mix */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Papers by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.paperStatus.every((s) => s.count === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No papers yet.</p>
            ) : (
              data.paperStatus.map((s) => {
                const pct = Math.round((s.count / totalPapers) * 100);
                const bar =
                  s.status === "PUBLISHED"
                    ? "bg-emerald-500"
                    : s.status === "DRAFT"
                      ? "bg-amber-500"
                      : "bg-zinc-500";
                return (
                  <div key={s.status}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{PAPER_STATUS_LABELS[s.status]}</span>
                      <span className="font-medium">
                        {s.count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
            <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {data.assignmentCount} assignment{data.assignmentCount === 1 ? "" : "s"} total ·{" "}
              <span className="font-medium text-foreground">{data.activeAssignments}</span> active now
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second analytics row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* AI pipeline */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              AI Question Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiTotal === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No AI-generated questions yet.
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-[Rasa] text-3xl font-bold text-amber-400">
                    {data.pendingAiQuestions}
                  </span>
                  <span className="text-sm text-muted-foreground">awaiting teacher review</span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
                    {data.aiApprovedTotal} approved
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    {data.aiRejectedTotal} rejected
                  </span>
                </div>
              </>
            )}
            <Link
              href="/dashboard/admin/ai-generator"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open AI generator <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        {/* Top subject banks */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Biggest Subject Banks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.subjects.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No questions in the bank yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.subjects.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="font-[Rasa] w-5 text-sm font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {s.questionCount} Qs
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{
                            width: `${Math.max(6, Math.round((s.questionCount / (data.subjects[0]?.questionCount || 1)) * 100))}%`,
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

        {/* Grading health */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              Grading Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="font-[Rasa] text-3xl font-bold">
                {data.averagePercent !== null ? `${data.averagePercent}%` : "—"}
              </span>
              <span className="text-sm text-muted-foreground">school average score</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.gradedSubmissions > 0
                ? `From ${data.gradedSubmissions} graded submission${data.gradedSubmissions === 1 ? "" : "s"} across all assignments.`
                : "No graded submissions yet."}
            </p>
            <div className="flex gap-2">
              <Link href="/dashboard/teacher/assignments">
                <Button variant="outline" size="sm" className="gap-2">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Assignments
                </Button>
              </Link>
              <Link href="/dashboard/admin/users">
                <Button variant="outline" size="sm" className="gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Staff
                </Button>
              </Link>
            </div>
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                No assignments created yet.
              </p>
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
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] ${STATUS_BADGE[a.status] ?? ""}`}
                          >
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                No papers yet — create the first one.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {data.recentPapers.map((p) => (
                  <Link key={p.id} href={`/dashboard/papers/${p.id}`} className="block">
                    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{p.title}</span>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] ${STATUS_BADGE[p.status] ?? ""}`}
                          >
                            {p.status}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.subjectName} · {p.creatorName ?? "—"} · {formatDateISO(p.createdAt)}
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

      {/* Management shortcuts */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            Manage Your School
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Users & Staff", href: "/dashboard/admin/users", icon: Users },
              { label: "Classes & Subjects", href: "/dashboard/taxonomy", icon: FolderTree },
              { label: "AI Generator", href: "/dashboard/admin/ai-generator", icon: Sparkles },
              { label: "All Papers", href: "/dashboard/papers", icon: FileText },
              { label: "Question Bank", href: "/dashboard/questions", icon: HelpCircle },
            ].map((a) => (
              <Link key={a.href} href={a.href}>
                <Button variant="outline" className="gap-2 font-[Nunito]">
                  <a.icon className="h-4 w-4" />
                  {a.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
