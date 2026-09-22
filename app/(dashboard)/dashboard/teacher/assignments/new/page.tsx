"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAssignment } from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

type Paper = { id: string; title: string };
type ClassLevel = { id: string; name: string };

export default function NewAssignmentPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [classes, setClasses] = useState<ClassLevel[]>([]);
  const [form, setForm] = useState({
    title: "",
    paperId: "",
    classLevelId: "",
    type: "EXAM" as "EXAM" | "HOMEWORK",
    startTime: "",
    endTime: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/papers?status=PUBLISHED").then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
    ]).then(([p, c]) => {
      setPapers(p.items || []);
      setClasses(c.items || []);
    }).catch(() => {});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createAssignment(form);
      if (result.success) {
        toast.success("Assignment created successfully!");
        router.push("/dashboard/teacher/assignments");
      } else {
        toast.error(result.error || "Failed to create assignment");
        setError(result.error || "Failed to create assignment");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/teacher/assignments">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">New Assignment</h1>
          <p className="font-[Nunito] text-sm text-muted-foreground">
            Assign a published paper to a class
          </p>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Label className="font-[Nunito] text-sm font-medium">Assignment Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Unit 3 Math Test"
                required
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-[Nunito] text-sm font-medium">Paper</Label>
                <Select value={form.paperId} onValueChange={(v) => setForm({ ...form, paperId: v ?? "" })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select paper" />
                  </SelectTrigger>
                  <SelectContent>
                    {papers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-[Nunito] text-sm font-medium">Class</Label>
                <Select value={form.classLevelId} onValueChange={(v) => setForm({ ...form, classLevelId: v ?? "" })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-[Nunito] text-sm font-medium">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "EXAM" | "HOMEWORK" })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXAM">Exam (Timed)</SelectItem>
                  <SelectItem value="HOMEWORK">Homework</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-[Nunito] text-sm font-medium">Start Time</Label>
                <Input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-[Nunito] text-sm font-medium">End Time</Label>
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  required
                  className="h-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="h-10 w-full bg-secondary font-bold text-primary hover:bg-secondary/90"
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Creating..." : "Create Assignment"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
