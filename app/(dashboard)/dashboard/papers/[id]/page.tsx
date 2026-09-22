import { notFound } from "next/navigation";
import { getPaperById, publishPaper } from "../actions";
import { PaperDetailClient } from "./paper-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperDetailPage({ params }: PageProps) {
  const { id } = await params;
  const paper = await getPaperById(id);

  if (!paper) {
    notFound();
  }

  return <PaperDetailClient paper={paper} />;
}
