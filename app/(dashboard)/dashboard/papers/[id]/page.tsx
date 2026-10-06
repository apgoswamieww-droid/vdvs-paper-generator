import { notFound } from "next/navigation";
import { getPaperById, listHeaderTemplates } from "../actions";
import { PaperDetailClient } from "./paper-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [paper, templates] = await Promise.all([getPaperById(id), listHeaderTemplates()]);

  if (!paper) {
    notFound();
  }

  return <PaperDetailClient paper={paper} templates={templates} />;
}
