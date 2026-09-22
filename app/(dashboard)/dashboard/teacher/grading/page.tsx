import { Suspense } from "react";
import { GradingContent } from "@/components/teacher/grading-content";

export default function GradingPage() {
  return (
    <Suspense>
      <GradingContent />
    </Suspense>
  );
}
