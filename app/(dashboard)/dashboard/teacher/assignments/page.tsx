"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAssignments, type AssignmentDTO } from "../actions";
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
import { Plus, ClipboardList, Clock, CheckCircle, AlertCircle } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  CLOSED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const TYPE_BADGE: Record<string, string> = {
  EXAM: "bg-secondary/15 text-secondary border-secondary/20",
  HOMEWORK: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAssignments()
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Assignments</h1>
          <p className="font-[Nunito] text-sm text-muted-foreground">
            Manage paper assignments for your classes
          </p>
        </div>
        <Link href="/dashboard/teacher/assignments/new">
          <Button className="gap-2 bg-secondary text-primary hover:bg-secondary/90 font-semibold">
            <Plus className="h-4 w-4" />
            New Assignment
          </Button>
        </Link>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                <ClipboardList className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-[Nunito] mt-4 text-sm text-muted-foreground">
                No assignments yet. Create your first one.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-[Nunito]">Title</TableHead>
                  <TableHead className="font-[Nunito]">Class</TableHead>
                  <TableHead className="font-[Nunito]">Type</TableHead>
                  <TableHead className="font-[Nunito]">Status</TableHead>
                  <TableHead className="font-[Nunito]">Submissions</TableHead>
                  <TableHead className="font-[Nunito]">Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-[Nunito] font-medium">
                      <Link href={`/dashboard/teacher/submissions?assignmentId=${a.id}`} className="text-foreground hover:text-secondary hover:underline">
                        {a.title}
                      </Link>
                    </TableCell>
                    <TableCell className="font-[Nunito] text-muted-foreground">{a.className}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_BADGE[a.type] || ""}>
                        {a.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[a.status] || ""}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-[Nunito] text-muted-foreground">
                      {a.submittedCount}/{a.totalSubmissions}
                    </TableCell>
                    <TableCell className="font-[Nunito] text-muted-foreground">
                      {new Date(a.endTime).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
