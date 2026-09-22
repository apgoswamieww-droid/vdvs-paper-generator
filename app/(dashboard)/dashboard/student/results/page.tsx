import { Suspense } from "react";
import { ResultsContent } from "@/components/student/results-content";

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  );
}
