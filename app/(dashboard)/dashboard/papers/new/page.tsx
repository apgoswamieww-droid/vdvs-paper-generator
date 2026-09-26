import type { Metadata } from "next";
import { getTaxonomyTree } from "../../questions/actions";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { EMPTY_HEADER, defaultHeaderFromSchool } from "@/lib/paper-header";
import { PaperBuilderClient } from "./paper-builder-client";

export const metadata: Metadata = {
  title: "Create Paper",
  description: "Build a new exam paper manually or via blueprint.",
};

export default async function NewPaperPage() {
  const taxonomy = await getTaxonomyTree();
  const { schoolId } = await requireSession();
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      defaultInstructions: true,
      watermarkText: true,
      name: true,
      logoUrl: true,
      address: true,
      phone: true,
      board: true,
      academicYear: true,
    },
  });

  const profile = {
    name: school?.name ?? "",
    logoUrl: school?.logoUrl ?? null,
    address: school?.address ?? null,
    phone: school?.phone ?? null,
    board: school?.board ?? null,
    academicYear: school?.academicYear ?? null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-2xl font-bold text-foreground">Create New Paper</h1>
        <p className="mt-1 text-sm text-slate-400">
          Choose between Manual selection or Blueprint auto-generation.
        </p>
      </div>
      <PaperBuilderClient
        taxonomy={taxonomy}
        paperDefaults={{
          ...profile,
          defaultInstructions: school?.defaultInstructions ?? "",
          watermarkText: school?.watermarkText ?? "",
          defaultHeader: school ? defaultHeaderFromSchool(profile) : EMPTY_HEADER,
        }}
      />
    </div>
  );
}