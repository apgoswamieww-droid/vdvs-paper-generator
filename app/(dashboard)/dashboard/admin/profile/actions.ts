"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// ============================================================
//  PROFILE — the logged-in SCHOOL_ADMIN updates their own
//  account (name / avatar) and changes their own password.
//  Always operates on the session user — never on input.
// ============================================================

export type ProfileActionResult = { success: boolean; error?: string };

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
  avatarUrl: z.string().trim().max(4000000, "Avatar image is too large.").nullish(), // URL or uploaded data-URL
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters.").max(72),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

export async function updateMyProfile(raw: unknown): Promise<ProfileActionResult> {
  try {
    const user = await requireSession();
    const parsed = profileSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        avatarUrl: parsed.data.avatarUrl || null,
      },
    });

    // The shared personal-settings page renders the same data.
    revalidatePath("/dashboard/admin/profile");
    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch {
    return { success: false, error: "Could not update your profile." };
  }
}

export async function changeMyPassword(raw: unknown): Promise<ProfileActionResult> {
  try {
    const user = await requireSession();
    const parsed = passwordSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!stored?.passwordHash) {
      return { success: false, error: "No stored password found. Ask your admin to reset it." };
    }

    const valid = await bcrypt.compare(parsed.data.currentPassword, stored.passwordHash);
    if (!valid) {
      return { success: false, error: "Your current password is incorrect." };
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return { success: true };
  } catch {
    return { success: false, error: "Could not change your password." };
  }
}