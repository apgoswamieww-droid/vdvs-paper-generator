"use server";

// ============================================================
//  Taxonomy Server Actions — Class → Subject → Chapter → Topic
//  All operations are tenant-scoped via requireSession().
// ============================================================

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  classLevelSchema,
  subjectSchema,
  chapterSchema,
  topicSchema,
  type ActionState,
} from "@/lib/validations";

const TAXONOMY_PATHS = ["/dashboard/taxonomy", "/dashboard/questions"];

function revalidateTaxonomy() {
  for (const p of TAXONOMY_PATHS) revalidatePath(p);
}

function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid data";
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && e.message.includes("Unique");
}

// ------------------------------------------------------------
//  Class levels
// ------------------------------------------------------------

export async function createClassLevel(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const parsed = classLevelSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  try {
    await prisma.classLevel.create({ data: { ...parsed.data, schoolId } });
  } catch (e) {
    if (isUniqueViolation(e)) return { success: false, error: "A class with this name already exists." };
    return { success: false, error: "Could not create class." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Class created." };
}

export async function updateClassLevel(
  id: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const parsed = classLevelSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  const res = await prisma.classLevel.updateMany({
    where: { id, schoolId },
    data: parsed.data,
  });
  if (res.count === 0) return { success: false, error: "Class not found." };

  revalidateTaxonomy();
  return { success: true, message: "Class updated." };
}

export async function deleteClassLevel(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    await prisma.classLevel.deleteMany({ where: { id, schoolId } });
  } catch {
    return { success: false, error: "Could not delete class." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Class deleted." };
}

// ------------------------------------------------------------
//  Subjects
// ------------------------------------------------------------

export async function createSubject(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const parsed = subjectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || undefined,
    classLevelId: formData.get("classLevelId"),
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  // Verify the class belongs to this tenant
  const cls = await prisma.classLevel.findFirst({
    where: { id: parsed.data.classLevelId, schoolId },
  });
  if (!cls) return { success: false, error: "Class not found in your school." };

  try {
    await prisma.subject.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code || null,
        classLevelId: parsed.data.classLevelId,
        schoolId,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e))
      return { success: false, error: "A subject with this name already exists in this class." };
    return { success: false, error: "Could not create subject." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Subject created." };
}

export async function updateSubject(
  id: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const parsed = subjectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || undefined,
    classLevelId: formData.get("classLevelId"),
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  try {
    const res = await prisma.subject.updateMany({
      where: { id, schoolId },
      data: {
        name: parsed.data.name,
        code: parsed.data.code || null,
        classLevelId: parsed.data.classLevelId,
      },
    });
    if (res.count === 0) return { success: false, error: "Subject not found." };
  } catch {
    return { success: false, error: "Could not update subject." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Subject updated." };
}

export async function deleteSubject(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    await prisma.subject.deleteMany({ where: { id, schoolId } });
  } catch {
    return { success: false, error: "Could not delete subject." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Subject deleted." };
}

// ------------------------------------------------------------
//  Chapters
// ------------------------------------------------------------

export async function createChapter(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const subjectId = String(formData.get("subjectId") ?? "");
  const parsed = chapterSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  // Verify the subject belongs to this tenant
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!subject) return { success: false, error: "Subject not found in your school." };

  try {
    await prisma.chapter.create({
      data: { name: parsed.data.name, order: parsed.data.order, subjectId },
    });
  } catch (e) {
    if (isUniqueViolation(e))
      return { success: false, error: "A chapter with this name already exists in this subject." };
    return { success: false, error: "Could not create chapter." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Chapter created." };
}

export async function updateChapter(
  id: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const parsed = chapterSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  const res = await prisma.chapter.updateMany({
    where: { id, subject: { schoolId } },
    data: parsed.data,
  });
  if (res.count === 0) return { success: false, error: "Chapter not found." };

  revalidateTaxonomy();
  return { success: true, message: "Chapter updated." };
}

export async function deleteChapter(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    await prisma.chapter.deleteMany({ where: { id, subject: { schoolId } } });
  } catch {
    return { success: false, error: "Could not delete chapter." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Chapter deleted." };
}

// ------------------------------------------------------------
//  Topics
// ------------------------------------------------------------

export async function createTopic(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const chapterId = String(formData.get("chapterId") ?? "");
  const parsed = topicSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  // Verify the chapter belongs to this tenant
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, subject: { schoolId } },
  });
  if (!chapter) return { success: false, error: "Chapter not found in your school." };

  try {
    await prisma.topic.create({
      data: { name: parsed.data.name, order: parsed.data.order, chapterId },
    });
  } catch (e) {
    if (isUniqueViolation(e))
      return { success: false, error: "A topic with this name already exists in this chapter." };
    return { success: false, error: "Could not create topic." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Topic created." };
}

export async function updateTopic(
  id: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const parsed = topicSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { success: false, error: firstIssueMessage(parsed.error) };

  const res = await prisma.topic.updateMany({
    where: { id, chapter: { subject: { schoolId } } },
    data: parsed.data,
  });
  if (res.count === 0) return { success: false, error: "Topic not found." };

  revalidateTaxonomy();
  return { success: true, message: "Topic updated." };
}

export async function deleteTopic(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    await prisma.topic.deleteMany({ where: { id, chapter: { subject: { schoolId } } } });
  } catch {
    return { success: false, error: "Could not delete topic." };
  }

  revalidateTaxonomy();
  return { success: true, message: "Topic deleted." };
}
