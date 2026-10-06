"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, type NotificationType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";
import { toPersistedHeaderConfig, type HeaderConfig } from "@/lib/paper-header";
import { headerConfigSchema } from "@/lib/validations";
import {
  savePreferences,
  notify,
  NOTIFICATION_EVENTS,
  type ChannelPrefs,
} from "@/lib/notifications";
import { getSession } from "@/lib/session";

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
    headerConfig: headerConfigSchema.nullish(),
  }),
  z.object({
    section: z.literal("permissions"),
    allowSelfRegistration: z.boolean(),
    teacherCanEdit: z.boolean(),
  }),
  z.object({
    section: z.literal("notifications"),
    entries: z
      .array(
        z.object({
          event: z.enum(
            NOTIFICATION_EVENTS.map((e) => e.value) as [
              NotificationType,
              ...NotificationType[],
            ]
          ),
          prefs: z.object({
            inApp: z.boolean(),
            push: z.boolean(),
            email: z.boolean(),
            reminderHours: z.number().int().min(1).max(720),
          }),
        })
      )
      .min(1),
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

    // Notifications live in their own table (one row per school + event),
    // so they are saved through the preference upserts, not school.update.
    if (section === "notifications") {
      await savePreferences(
        scope.schoolId,
        parsed.data.entries as { event: NotificationType; prefs: ChannelPrefs }[]
      );
      revalidatePath("/dashboard/admin/settings");
      return { success: true };
    }

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
                ...(parsed.data.headerConfig === undefined
                  ? {}
                  : {
                      headerConfig:
                        parsed.data.headerConfig === null
                          ? Prisma.JsonNull
                          : (toPersistedHeaderConfig(parsed.data.headerConfig as HeaderConfig) as unknown as Prisma.InputJsonValue),
                    }),
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
// ============================================================
//  Send test notification
//  The admin's own account receives a real notification with
//  preferences bypassed (in-app + browser push), so they can
//  confirm delivery without waiting for a real assignment.
// ============================================================

export type TestNotificationResult = {
  success: boolean;
  error?: string;
  pushSent?: number;
  pushSkipped?: string;
};

export async function sendTestNotification(): Promise<TestNotificationResult> {
  try {
    const scope = await resolveAdminScope();
    const session = await getSession();
    if (!session?.id) return { success: false, error: "Sign in again and retry." };

    const result = await notify({
      userId: session.id,
      schoolId: scope.schoolId,
      type: "QUESTION_ASSIGNED",
      title: "Test notification",
      body: "Notifications are working — assignments, review outcomes and reminders arrive like this.",
      data: { url: "/dashboard/notifications" },
      force: true,
    });

    if (result.skipped === "error") {
      return { success: false, error: "Could not create the test notification." };
    }
    if (!result.created && result.pushSent === 0) {
      return {
        success: true,
        pushSent: 0,
        pushSkipped: "Created in your feed — enable browser push to also get the popup.",
      };
    }
    return { success: true, pushSent: result.pushSent, pushSkipped: result.skipped };
  } catch {
    return { success: false, error: "Could not send the test notification." };
  }
}
