"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listStudentAssignments, startExam, type StudentAssignmentDTO } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, Play, CheckCircle, ClipboardList } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  SUBMITTED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  AUTO_SUBMITTED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

export default function ExamsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<StudentAssignmentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    listStudentAssignments()
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, []);

  async function handleStart(assignmentId: string) {
    setStarting(assignmentId);
    try {
      const submissionId = await startExam(assignmentId);
      router.push(`/dashboard/student/exams/${submissionId}`);
    } catch {
      setStarting(null);
    }
  }

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">My Exams</h1>
        <p className="font-[Nunito] text-sm text-muted-foreground">
          View and take your assigned exams and homework
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                <ClipboardList className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-[Nunito] mt-4 text-sm text-muted-foreground">
                No exams assigned yet. Check back later.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-[Nunito]">Exam</TableHead>
                  <TableHead className="font-[Nunito]">Type</TableHead>
                  <TableHead className="font-[Nunito]">Status</TableHead>
                  <TableHead className="font-[Nunito]">Total Marks</TableHead>
                  <TableHead className="font-[Nunito]">Deadline</TableHead>
                  <TableHead className="font-[Nunito]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const isActive = a.assignmentStatus === "ACTIVE" && new Date(a.endTime) > now;
                  const canStart = a.submissionStatus === "NOT_STARTED" && isActive;
                  const canResume = a.submissionStatus === "IN_PROGRESS" && isActive;

                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-[Nunito] font-medium">{a.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {a.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[a.submissionStatus] || ""}>
                          {a.submissionStatus.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-[Nunito] text-muted-foreground">
                        {a.totalMarks}
                      </TableCell>
                      <TableCell className="font-[Nunito] text-muted-foreground text-xs">
                        {new Date(a.endTime).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {(canStart || canResume) && (
                          <Button
                            size="sm"
                            className="gap-1 bg-secondary text-primary hover:bg-secondary/90 font-semibold"
                            onClick={() => handleStart(a.assignmentId)}
                            disabled={starting === a.assignmentId}
                          >
                            {canResume ? <Play className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            {starting === a.assignmentId ? "Starting..." : canResume ? "Resume" : "Start"}
                          </Button>
                        )}
                        {a.submissionStatus === "SUBMITTED" || a.submissionStatus === "AUTO_SUBMITTED" ? (
                          <span className="font-[Nunito] text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Completed
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
