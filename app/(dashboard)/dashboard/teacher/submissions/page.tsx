import { Suspense } from "react";
import { SubmissionsContent } from "@/components/teacher/submissions-content";

export default function SubmissionsPage() {
  return (
    <Suspense>
      <SubmissionsContent />
    </Suspense>
  );
}
