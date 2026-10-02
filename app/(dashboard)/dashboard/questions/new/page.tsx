import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { getQuestionById, getTaxonomyTree } from "../actions";
import { NewQuestionPageClient } from "../new-question-page-client";

export const metadata: Metadata = {
  title: "Add Question",
  description: "Create a new question in the question bank.",
};

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  await requireSession();
  const { link } = await searchParams;

  // ?link=<id> opens the form as that question's bilingual translation —
  // metadata is inherited and the medium flips to its opposite.
  const [tree, linkParent] = await Promise.all([
    getTaxonomyTree(),
    link ? getQuestionById(link) : Promise.resolve(null),
  ]);

  return <NewQuestionPageClient tree={tree} linkParent={linkParent} />;
}
