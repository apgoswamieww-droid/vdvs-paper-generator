import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree, getQuestionById } from "../actions";
import { QuestionForm } from "../question-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Question",
  description: "Edit an existing question in the question bank.",
};

export default async function EditQuestionPage({ params }: PageProps) {
  await requireSession();
  const { id } = await params;

  const [tree, question] = await Promise.all([
    getTaxonomyTree(),
    getQuestionById(id),
  ]);

  if (!question) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <QuestionForm tree={tree} editing={question} />
    </div>
  );
}
