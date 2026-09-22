import type { Metadata } from "next";
import { listPapers } from "./actions";
import { PapersClient } from "./papers-client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Papers",
  description: "Manage and generate exam papers.",
};

export default async function PapersPage() {
  const result = await listPapers({ page: 1, pageSize: 20 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Papers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, manage, and export exam papers.
          </p>
        </div>
        <Link href="/dashboard/papers/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Paper
          </Button>
        </Link>
      </div>
      <PapersClient initialData={result} />
    </div>
  );
}
