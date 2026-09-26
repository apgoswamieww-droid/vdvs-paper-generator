"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";

// ============================================================
//  CLASSES & SECTIONS — tenant-scoped class management
// ============================================================

export type ClassActionError = { success: boolean; error?: string };

export async function createClass(raw: unknown): Promise<ClassActionError> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Class name must be at least 2 characters.").max(60),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const last = await prisma.classLevel.findFirst({
      where: { schoolId: scope.schoolId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    await prisma.classLevel.create({
      data: {
        name: parsed.data.name,
        order: (last?.order ?? -1) + 1,
        schoolId: scope.schoolId,
      },
    });

    revalidatePath("/dashboard/admin/classes");
    return { success: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: "A class with this name already exists in the school." };
    }
    return { success: false, error: "Could not create the class." };
  }
}

export async function deleteClass(raw: unknown): Promise<ClassActionError> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = z.object({ classId: z.string().min(1) }).safeParse(raw);
    if (!parsed.success) return { success: false, error: "Invalid request." };

    const cls = await prisma.classLevel.findFirst({
      where: { id: parsed.data.classId, schoolId: scope.schoolId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "Class not found in this school." };

    // Don't cascade-delete questions: refuse while subjects/topics exist.
    const subjectCount = await prisma.subject.count({
      where: { classLevelId: parsed.data.classId },
    });
    if (subjectCount > 0) {
      return {
        success: false,
        error: "This class still has curriculum configured. Remove its subjects first.",
      };
    }

    await prisma.classLevel.delete({ where: { id: parsed.data.classId } });
    revalidatePath("/dashboard/admin/classes");
    return { success: true };
  } catch {
    return { success: false, error: "Could not delete the class." };
  }
}