"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getAssignmentSubmissions, gradeAnswer } from "@/app/(dashboard)/dashboard/teacher/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save } from "lucide-react";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import Link from "next/link";

export function GradingContent() {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get("submissionId");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!submissionId) { setLoading(false); return; }
    setLoading(false);
  }, [submissionId]);

  function handleGrade(answerId: string) {
    startTransition(async () => {
      const result = await gradeAnswer(answerId, marks[answerId] ?? 0, comments[answerId]);
      if (result.success) {
        toast.success("Answer graded successfully!");
        setData((prev: any) => ({
          ...prev,
          submissions: prev.submissions.map((s: any) =>
            s.id === submissionId
              ? {
                  ...s,
                  answers: s.answers.map((a: any) =>
                    a.id === answerId
                      ? { ...a, awardedMarks: marks[answerId], graderComment: comments[answerId], gradedAt: new Date() }
                      : a
                  ),
                }
              : s
          ),
        }));
      } else {
        toast.error(result.error || "Failed to grade answer");
      }
    });
  }

  if (!submissionId) {
    return (
      <div className="space-y-6">
        <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Manual Grading</h1>
        <p className="font-[Nunito] text-sm text-muted-foreground">
          Select a submission from the{" "}
          <Link href="/dashboard/teacher/submissions" className="text-secondary hover:underline">
            submissions page
          </Link>{" "}
          to start grading.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/teacher/submissions">
          <Button variant="ghost" size="icon-sm"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Manual Grading</h1>
          <p className="font-[Nunito] text-sm text-muted-foreground">
            Review and grade subjective answers
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Submission not found.</p>
      ) : (
        <div className="space-y-4">
          {data.submissions?.[0]?.answers?.map((answer: any) => {
            const q = answer.question;
            return (
              <Card key={answer.id} className="border-border/50">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{q.questionType}</Badge>
                        <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
                        <span className="font-[Nunito] text-xs text-muted-foreground">Max: {q.marks} marks</span>
                      </div>
                      <div className="font-[Nunito] text-sm">
                        <KaTeXRenderer text={q.questionText} />
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="font-[Nunito] text-xs text-muted-foreground mb-1">Student Answer:</p>
                        <p className="font-[Nunito] text-sm">
                          {answer.selectedOption || answer.answerText || "No answer"}
                        </p>
                      </div>
                    </div>
                    <div className="w-48 shrink-0 space-y-3">
                      <div className="space-y-1">
                        <Label className="font-[Nunito] text-xs text-muted-foreground">Marks</Label>
                        <Input
                          type="number"
                          min={0}
                          max={q.marks}
                          step={0.5}
                          value={marks[answer.id] ?? answer.awardedMarks ?? ""}
                          onChange={(e) => setMarks({ ...marks, [answer.id]: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="font-[Nunito] text-xs text-muted-foreground">Comment</Label>
                        <Textarea
                          value={comments[answer.id] ?? answer.graderComment ?? ""}
                          onChange={(e) => setComments({ ...comments, [answer.id]: e.target.value })}
                          className="text-sm min-h-[60px]"
                          placeholder="Optional feedback..."
                        />
                      </div>
                      <Button
                        size="sm"
                        className="w-full gap-1 bg-secondary text-primary hover:bg-secondary/90"
                        onClick={() => handleGrade(answer.id)}
                        disabled={isPending}
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
