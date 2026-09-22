"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAssignmentSubmissions } from "@/app/(dashboard)/dashboard/teacher/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Users, CheckCircle, Clock, XCircle } from "lucide-react";
import Link from "next/link";

const STATUS_ICON: Record<string, React.ReactNode> = {
  NOT_STARTED: <XCircle className="h-4 w-4 text-zinc-500" />,
  IN_PROGRESS: <Clock className="h-4 w-4 text-amber-400" />,
  SUBMITTED: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  AUTO_SUBMITTED: <Clock className="h-4 w-4 text-blue-400" />,
};

export function SubmissionsContent() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assignmentId) { setLoading(false); return; }
    getAssignmentSubmissions(assignmentId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [assignmentId]);

  if (!assignmentId) {
    return (
      <div className="space-y-6">
        <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Submissions</h1>
        <p className="font-[Nunito] text-sm text-muted-foreground">
          Select an assignment from the{" "}
          <Link href="/dashboard/teacher/assignments" className="text-secondary hover:underline">
            assignments list
          </Link>{" "}
          to view submissions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/teacher/assignments">
          <Button variant="ghost" size="icon-sm"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Submissions</h1>
          {data && (
            <p className="font-[Nunito] text-sm text-muted-foreground">
              {data.title} — {data.classLevel.name}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Students", value: data.submissions.length, icon: Users },
              { label: "Submitted", value: data.submissions.filter((s: any) => s.status === "SUBMITTED" || s.status === "AUTO_SUBMITTED").length, icon: CheckCircle },
              { label: "In Progress", value: data.submissions.filter((s: any) => s.status === "IN_PROGRESS").length, icon: Clock },
              { label: "Not Started", value: data.submissions.filter((s: any) => s.status === "NOT_STARTED").length, icon: XCircle },
            ].map((s) => (
              <Card key={s.label} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <s.icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-[Nunito] text-xs text-muted-foreground">{s.label}</p>
                      <p className="font-[Rasa] text-2xl font-bold">{s.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-[Nunito]">Student</TableHead>
                    <TableHead className="font-[Nunito]">Status</TableHead>
                    <TableHead className="font-[Nunito]">Score</TableHead>
                    <TableHead className="font-[Nunito]">Submitted At</TableHead>
                    <TableHead className="font-[Nunito]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.submissions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-[Nunito] font-medium">
                        {sub.student.name || sub.student.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {STATUS_ICON[sub.status]}
                          <span className="font-[Nunito] text-xs text-muted-foreground">{sub.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-[Nunito]">
                        {sub.totalScore != null ? `${sub.totalScore}` : "—"}
                      </TableCell>
                      <TableCell className="font-[Nunito] text-muted-foreground text-xs">
                        {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        {sub.status === "SUBMITTED" || sub.status === "AUTO_SUBMITTED" ? (
                          <Link href={`/dashboard/teacher/grading?submissionId=${sub.id}`}>
                            <Button variant="outline" size="sm" className="font-[Nunito] text-xs">Grade</Button>
                          </Link>
                        ) : (
                          <span className="font-[Nunito] text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Assignment not found.</p>
      )}
    </div>
  );
}
