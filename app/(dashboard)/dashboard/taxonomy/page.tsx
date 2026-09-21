// ============================================================
//  Taxonomy Manager page — server shell fetching the tree
// ============================================================

import { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree } from "../questions/actions";
import { TaxonomyManager } from "./taxonomy-manager";

export const metadata: Metadata = {
  title: "Curriculum Taxonomy",
  description: "Manage Classes, Subjects, Chapters and Topics.",
};

export default async function TaxonomyPage() {
  await requireSession(); // tenant guard (dev stub)
  const tree = await getTaxonomyTree();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Curriculum Taxonomy</h1>
        <p className="mt-1 text-sm text-slate-400">
          Structure your curriculum: Classes → Subjects → Chapters → Topics. Used across the
          question bank and paper generator.
        </p>
      </div>
      <TaxonomyManager initialTree={tree} />
    </div>
  );
}
