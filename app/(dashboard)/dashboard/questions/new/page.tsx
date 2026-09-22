import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree } from "../actions";
import { NewQuestionPageClient } from "../new-question-page-client";

export const metadata: Metadata = {
  title: "Add Question",
  description: "Create a new question in the question bank.",
};

export default async function NewQuestionPage() {
  await requireSession();
  const tree = await getTaxonomyTree();

  return <NewQuestionPageClient tree={tree} />;
}