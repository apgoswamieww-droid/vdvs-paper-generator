import type { Metadata } from "next";
import { getTaxonomyTree } from "../../questions/actions";
import { PaperBuilderClient } from "./paper-builder-client";

export const metadata: Metadata = {
  title: "Create Paper",
  description: "Build a new exam paper manually or via blueprint.",
};

export default async function NewPaperPage() {
  const taxonomy = await getTaxonomyTree();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-2xl font-bold text-foreground">Create New Paper</h1>
        <p className="mt-1 text-sm text-slate-400">
          Choose between Manual selection or Blueprint auto-generation.
        </p>
      </div>
      <PaperBuilderClient taxonomy={taxonomy} />
    </div>
  );
}
