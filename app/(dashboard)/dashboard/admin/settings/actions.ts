"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";

// ============================================================
//  SCHOOL SETTINGS — tenant-scoped advanced configuration
//  Each UI tab posts its own `section` plus its subset of fields.
//  The tenant is ALWAYS resolved from the session via
//  resolveAdminScope() — never trusted from input.
// ============================================================

const BOARDS = ["GSEB", "CBSE"] as const;
const MEDIUMS = ["ENGLISH", "GUJARATI"] as const;

const sectionSchema = z.union([
  z.object({
    section: z.literal("general"),
    name: z.string().trim().min(2, "School name must be at least 2 characters.").max(120),
    board: z.enum(BOARDS),
    address: z.string().trim().max(300).nullish(),
    phone: z.string().trim().max(40).nullish(),
    website: z.string().trim().max(200).nullish(),
    logoUrl: z.string().trim().max(4000000).nullish(), // URLs or self-uploaded data-URLs
  }),
  z.object({
    section: z.literal("academic"),
    academicYear: z.string().trim().max(20).nullish(),
    mediums: z.array(z.enum(MEDIUMS)).min(1, "Select at least one medium."),
  }),
  z.object({
    section: z.literal("papers"),
    defaultInstructions: z.string().trim().max(5000).nullish(),
    watermarkText: z.string().trim().max(100).nullish(),
  }),
  z.object({
    section: z.literal("permissions"),
    allowSelfRegistration: z.boolean(),
    teacherCanEdit: z.boolean(),
  }),
]);

export type SettingsActionResult = { success: boolean; error?: string };

export async function updateSchoolSettings(raw: unknown): Promise<SettingsActionResult> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = sectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { section } = parsed.data;

    const data =
      section === "general"
        ? {
            name: parsed.data.name,
            board: parsed.data.board,
            address: parsed.data.address || null,
            phone: parsed.data.phone || null,
            website: parsed.data.website || null,
            logoUrl: parsed.data.logoUrl || null,
          }
        : section === "academic"
          ? {
              academicYear: parsed.data.academicYear || null,
              mediums: parsed.data.mediums,
            }
          : section === "papers"
            ? {
                defaultInstructions: parsed.data.defaultInstructions || null,
                watermarkText: parsed.data.watermarkText || null,
              }
            : {
                allowSelfRegistration: parsed.data.allowSelfRegistration,
                teacherCanEdit: parsed.data.teacherCanEdit,
              };

    await prisma.school.update({
      where: { id: scope.schoolId },
      data,
    });

    revalidatePath("/dashboard/admin/settings");
    return { success: true };
  } catch {
    return { success: false, error: "Could not save the school settings." };
  }
}