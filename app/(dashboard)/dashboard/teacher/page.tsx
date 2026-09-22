import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ClipboardList,
  GraduationCap,
  Plus,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Teacher Dashboard",
};

export default function TeacherDashboardPage() {
  const stats = [
    { label: "Assigned Papers", value: "0", icon: ClipboardList, color: "text-secondary", bg: "bg-secondary/10" },
    { label: "Pending Grading", value: "0", icon: FileText, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "My Students", value: "0", icon: GraduationCap, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">Teacher Dashboard</h1>
        <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
          Manage assignments, track submissions, and grade papers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-[Nunito] text-sm text-muted-foreground">{s.label}</p>
                  <p className="font-[Rasa] mt-2 text-3xl font-bold">{s.value}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/teacher/assignments/new">
              <Button className="gap-2 bg-secondary text-primary hover:bg-secondary/90 font-semibold">
                <Plus className="h-4 w-4" />
                New Assignment
              </Button>
            </Link>
            <Link href="/dashboard/teacher/assignments">
              <Button variant="outline" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                View Assignments
              </Button>
            </Link>
            <Link href="/dashboard/teacher/grading">
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Grade Papers
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
