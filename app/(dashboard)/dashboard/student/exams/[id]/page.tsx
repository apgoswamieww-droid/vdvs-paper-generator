"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { getExamData, submitExam } from "../../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import {
  Clock,
  Send,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
} from "lucide-react";

export default function ExamEnginePage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;

  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load exam data
  useEffect(() => {
    getExamData(submissionId)
      .then((data) => {
        setExam(data);
        setAnswers(data.existingAnswers);
        if (data.startedAt) {
          const end = new Date(data.endTime).getTime();
          const now = Date.now();
          setTimeLeft(Math.max(0, Math.floor((end - now) / 1000)));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [submissionId]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0 && exam) {
      handleSubmit(true);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [exam]);

  const handleSubmit = useCallback(
    async (autoSubmit = false) => {
      if (submitting) return;
      setSubmitting(true);
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        const result = await submitExam(submissionId, answers);
        toast.success(autoSubmit ? "Time expired — paper auto-submitted!" : "Exam submitted successfully!");
        router.push(
          `/dashboard/student/results?score=${result.totalScore}&total=${result.totalMarks}&auto=${autoSubmit}`
        );
      } catch {
        toast.error("Failed to submit exam. Please try again.");
        setSubmitting(false);
      }
    },
    [submitting, answers, submissionId, router]
  );

  // Fullscreen request
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Exam not found.</p>
      </div>
    );
  }

  const sections = exam.paper.sections;
  const section = sections[currentSection];
  const allQuestions = sections.flatMap((s: any) =>
    s.questions.map((pq: any) => ({ ...pq.question, sectionTitle: s.title, marksOverride: pq.marksOverride }))
  );
  const flatIdx = sections
    .slice(0, currentSection)
    .reduce((acc: number, s: any) => acc + s.questions.length, 0) + currentQuestion;
  const totalQ = allQuestions.length;
  const q = allQuestions[flatIdx];

  if (!q) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No questions found.</p>
      </div>
    );
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isLowTime = timeLeft < 300;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="font-[Rasa] text-lg font-bold truncate max-w-[200px] sm:max-w-none">
            {exam.paper.title}
          </h1>
          <Badge variant="outline" className="text-xs">
            {flatIdx + 1}/{totalQ}
          </Badge>
        </div>
        <div className={`flex items-center gap-2 font-mono text-lg font-bold ${isLowTime ? "text-destructive animate-pulse" : "text-foreground"}`}>
          <Clock className="h-5 w-5" />
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
      </header>

      {/* Question navigation pills */}
      <div className="border-b border-border bg-card/50 px-4 py-2 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {allQuestions.map((_: any, i: number) => {
            const hasAnswer = answers[allQuestions[i]?.id];
            return (
              <button
                key={i}
                onClick={() => {
                  // Find section and local index for flat index i
                  let count = 0;
                  for (let s = 0; s < sections.length; s++) {
                    if (i < count + sections[s].questions.length) {
                      setCurrentSection(s);
                      setCurrentQuestion(i - count);
                      return;
                    }
                    count += sections[s].questions.length;
                  }
                }}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                  i === flatIdx
                    ? "bg-secondary text-primary"
                    : hasAnswer
                    ? "bg-primary/20 text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main question area */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {section.title}
            </Badge>
            <span className="font-[Nunito] text-xs text-muted-foreground">
              {q.marksOverride ?? q.marks} marks
            </span>
            <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
          </div>

          {/* Question text */}
          <div className="font-[Nunito] text-base leading-relaxed">
            <KaTeXRenderer text={q.questionText} />
          </div>

          {/* Answer input based on question type */}
          {q.questionType === "MCQ" && q.options ? (
            <RadioGroup
              value={answers[q.id] || ""}
              onValueChange={(v) => setAnswers({ ...answers, [q.id]: v ?? "" })}
              className="space-y-3"
            >
              {(q.options as any[]).map((opt: any) => (
                <label
                  key={opt.label}
                  className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                    answers[q.id] === opt.label
                      ? "border-secondary bg-secondary/5"
                      : "border-border hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <RadioGroupItem value={opt.label} className="mt-0.5" />
                  <div className="font-[Nunito] text-sm">
                    <span className="font-semibold mr-2">{opt.label}.</span>
                    <KaTeXRenderer text={opt.text} />
                  </div>
                </label>
              ))}
            </RadioGroup>
          ) : q.questionType === "TRUE_FALSE" ? (
            <RadioGroup
              value={answers[q.id] || ""}
              onValueChange={(v) => setAnswers({ ...answers, [q.id]: v ?? "" })}
              className="space-y-3"
            >
              {["True", "False"].map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                    answers[q.id] === opt
                      ? "border-secondary bg-secondary/5"
                      : "border-border hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <RadioGroupItem value={opt} />
                  <span className="font-[Nunito] text-sm font-medium">{opt}</span>
                </label>
              ))}
            </RadioGroup>
          ) : (
            <Textarea
              value={answers[q.id] || ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              placeholder="Type your answer here..."
              className="min-h-[120px] font-[Nunito] text-sm"
            />
          )}
        </div>
      </main>

      {/* Bottom navigation */}
      <footer className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (currentQuestion > 0) setCurrentQuestion(currentQuestion - 1);
              else if (currentSection > 0) {
                setCurrentSection(currentSection - 1);
                setCurrentQuestion(sections[currentSection - 1].questions.length - 1);
              }
            }}
            disabled={flatIdx === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          {flatIdx === totalQ - 1 ? (
            <Button
              className="gap-2 bg-secondary text-primary hover:bg-secondary/90 font-bold"
              onClick={() => setShowConfirm(true)}
            >
              <Send className="h-4 w-4" />
              Submit Exam
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (currentQuestion < sections[currentSection].questions.length - 1)
                  setCurrentQuestion(currentQuestion + 1);
                else if (currentSection < sections.length - 1) {
                  setCurrentSection(currentSection + 1);
                  setCurrentQuestion(0);
                }
              }}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </footer>

      {/* Confirm submit dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 border-border/50 shadow-2xl">
            <CardContent className="p-6 space-y-4 text-center">
              <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
              <h2 className="font-[Rasa] text-xl font-bold">Submit Exam?</h2>
              <p className="font-[Nunito] text-sm text-muted-foreground">
                You have answered {Object.keys(answers).length} of {totalQ} questions.
                {Object.keys(answers).length < totalQ &&
                  " Unanswered questions will receive zero marks."}
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => setShowConfirm(false)}>
                  Continue Exam
                </Button>
                <Button
                  className="bg-secondary text-primary hover:bg-secondary/90 font-bold"
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Confirm Submit"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
