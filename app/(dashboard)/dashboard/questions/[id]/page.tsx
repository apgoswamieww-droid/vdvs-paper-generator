import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree, getQuestionById } from "../actions";
import { buildListReturnUrl } from "../list-state";
import { QuestionForm } from "../question-form";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Edit Question",
  description: "Edit an existing question in the question bank.",
};

export default async function EditQuestionPage({ params, searchParams }: PageProps) {
  await requireSession();
  const { id } = await params;

  // The listing passes its table state along in this URL — hand it back to
  // the form so Update/Cancel return to the same page of the same query.
  const returnTo = buildListReturnUrl(await searchParams);

  const [tree, question] = await Promise.all([
    getTaxonomyTree(),
    getQuestionById(id),
  ]);

  if (!question) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <QuestionForm tree={tree} editing={question} returnTo={returnTo} />
    </div>
  );
}
