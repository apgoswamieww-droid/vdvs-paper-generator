"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStudentResults } from "@/app/(dashboard)/dashboard/student/actions";
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
import { Trophy, CheckCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export function ResultsContent() {
  const searchParams = useSearchParams();
  const instantScore = searchParams.get("score");
  const instantTotal = searchParams.get("total");
  const wasAuto = searchParams.get("auto") === "true";

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentResults()
      .then(setResults)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/student">
          <Button variant="ghost" size="icon-sm"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">My Results</h1>
          <p className="font-[Nunito] text-sm text-muted-foreground">
            View your exam scores and performance
          </p>
        </div>
      </div>

      {instantScore != null && (
        <Card className="border-secondary/30 bg-secondary/5">
          <CardContent className="p-6 text-center space-y-3">
            <Trophy className="h-12 w-12 text-secondary mx-auto" />
            <h2 className="font-[Rasa] text-2xl font-bold">
              {wasAuto ? "Time Expired — Auto-Submitted" : "Exam Submitted!"}
            </h2>
            <p className="font-[Nunito] text-lg">
              Your Score:{" "}
              <span className="font-bold text-secondary">
                {instantScore} / {instantTotal}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : results.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle className="h-12 w-12 text-muted-foreground" />
            <p className="font-[Nunito] mt-4 text-sm text-muted-foreground">
              No results yet. Take an exam to see your scores here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-[Nunito]">Exam</TableHead>
                  <TableHead className="font-[Nunito]">Score</TableHead>
                  <TableHead className="font-[Nunito]">MCQ</TableHead>
                  <TableHead className="font-[Nunito]">Subjective</TableHead>
                  <TableHead className="font-[Nunito]">Status</TableHead>
                  <TableHead className="font-[Nunito]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-[Nunito] font-medium">{r.assignmentTitle}</TableCell>
                    <TableCell>
                      <span className="font-[Rasa] text-lg font-bold text-secondary">
                        {r.score ?? "—"}
                      </span>
                      <span className="font-[Nunito] text-xs text-muted-foreground">/{r.totalMarks}</span>
                    </TableCell>
                    <TableCell className="font-[Nunito] text-muted-foreground">{r.mcqScore}</TableCell>
                    <TableCell className="font-[Nunito] text-muted-foreground">{r.subjectiveScore}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.gradedAt
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                        }
                      >
                        {r.gradedAt ? "Graded" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-[Nunito] text-xs text-muted-foreground">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
