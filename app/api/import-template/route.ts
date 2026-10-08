import { NextResponse } from "next/server";
import { buildQuestionTemplateDocx, templateFileName } from "@/lib/docx-table-template";
import { requireSession } from "@/lib/session";
import prisma from "@/lib/prisma";

// ============================================================
//  GET /api/import-template
//
//  Downloads the table-layout bulk question-import template.
//
//  The template records the taxonomy it was generated for, so the
//  importer can file the questions correctly and warn when a teacher
//  re-targets after downloading. Every id is resolved against the
//  caller's school — a crafted request cannot mint a template pointed
//  at another tenant's curriculum.
// ============================================================

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(request: Request) {
  let schoolId: string;
  try {
    schoolId = (await requireSession()).schoolId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";
  const chapterId = url.searchParams.get("chapterId")?.trim() ?? "";
  const topicId = url.searchParams.get("topicId")?.trim() || null;
  const requested = Number.parseInt(url.searchParams.get("count") ?? "10", 10);
  const count = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 50) : 10;

  if (!subjectId || !chapterId) {
    return NextResponse.json(
      { error: "Choose a subject and chapter before downloading the template." },
      { status: 400 }
    );
  }

  // Resolve subject + chapter + class in one go, scoped to the tenant.
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: {
      id: true,
      name: true,
      classLevel: { select: { id: true, name: true } },
    },
  });
  if (!subject) {
    return NextResponse.json({ error: "That subject is not part of your school." }, { status: 404 });
  }

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, subjectId: subject.id },
    select: { id: true, name: true },
  });
  if (!chapter) {
    return NextResponse.json(
      { error: "That chapter is not under the chosen subject." },
      { status: 404 }
    );
  }

  let topicName: string | null = null;
  if (topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, chapterId: chapter.id },
      select: { id: true, name: true },
    });
    if (!topic) {
      return NextResponse.json(
        { error: "That topic is not under the chosen chapter." },
        { status: 404 }
      );
    }
    topicName = topic.name;
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  });

  const bytes = buildQuestionTemplateDocx(
    {
      schoolId,
      classLevelId: subject.classLevel.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      topicId,
    },
    {
      school: school?.name ?? "Your school",
      classLevel: subject.classLevel.name,
      subject: subject.name,
      chapter: chapter.name,
      topic: topicName,
    },
    count
  );

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": DOCX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${templateFileName(
        subject.classLevel.name,
        subject.name
      )}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}