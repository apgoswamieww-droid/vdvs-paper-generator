"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";
import type { UserRole } from "@/types";

// ============================================================
//  SCHOOL ADMIN — User Management Server Actions
//  Every write resolves the tenant scope from the session and
//  filters/inserts with schoolId so cross-school access is impossible.
// ============================================================

const USER_ROLE_VALUES = ["TEACHER", "STUDENT"] as const;
const STAFF_ROLES: UserRole[] = ["TEACHER", "STUDENT"];

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  email: z.string().toLowerCase().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(USER_ROLE_VALUES),
  classLevelId: z.string().trim().optional().nullable(),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  email: z.string().toLowerCase().trim().email(),
  role: z.enum(USER_ROLE_VALUES),
  classLevelId: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UserActionResult = {
  success: boolean;
  error?: string;
  tempPassword?: string;
  userId?: string;
};

export async function createUser(raw: unknown): Promise<UserActionResult> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = createUserSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const { password, ...data } = parsed.data;

    // Enforce class-level belongs to the same tenant.
    if (data.classLevelId) {
      const cls = await prisma.classLevel.findFirst({
        where: { id: data.classLevelId, schoolId: scope.schoolId },
        select: { id: true },
      });
      if (!cls) return { success: false, error: "The selected class does not belong to this school." };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { ...data, passwordHash, schoolId: scope.schoolId, isActive: true },
      select: { id: true },
    });
    revalidatePath("/dashboard/admin/users");
    return { success: true, userId: user.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: "That email is already registered." };
    }
    return { success: false, error: "Could not create the user." };
  }
}

export async function updateUser(raw: unknown): Promise<UserActionResult> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = updateUserSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const { userId, ...data } = parsed.data;

    // The target user must belong to the resolved tenant — cross-school edits are rejected.
    const existing = await prisma.user.findFirst({
      where: { id: userId, schoolId: scope.schoolId, role: { in: STAFF_ROLES } },
      select: { id: true },
    });
    if (!existing) return { success: false, error: "User not found in this school." };

    if (data.classLevelId) {
      const cls = await prisma.classLevel.findFirst({
        where: { id: data.classLevelId, schoolId: scope.schoolId },
        select: { id: true },
      });
      if (!cls) return { success: false, error: "The selected class does not belong to this school." };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        role: data.role as UserRole,
        classLevelId: data.role === "STUDENT" ? data.classLevelId ?? null : null,
        ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
      },
    });
    revalidatePath("/dashboard/admin/users");
    return { success: true, userId };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: "That email is already registered to another account." };
    }
    return { success: false, error: "Could not update the user." };
  }
}

export async function deleteUser(raw: unknown): Promise<UserActionResult> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(raw);
    if (!parsed.success) return { success: false, error: "Invalid request." };

    // Scope-guarded: only users of THIS school, and never SUPER_ADMIN/SCHOOL_ADMIN roles.
    const existing = await prisma.user.findFirst({
      where: { id: parsed.data.userId, schoolId: scope.schoolId, role: { in: STAFF_ROLES } },
      select: { id: true },
    });
    if (!existing) return { success: false, error: "User not found in this school." };

    await prisma.user.delete({ where: { id: parsed.data.userId } });
    revalidatePath("/dashboard/admin/users");
    return { success: true, userId: parsed.data.userId };
  } catch {
    return { success: false, error: "Could not delete the user (they may have papers/imports on record)." };
  }
}

export async function resetUserPassword(raw: unknown): Promise<UserActionResult> {
  try {
    const scope = await resolveAdminScope((raw as { schoolId?: string })?.schoolId);
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(raw);
    if (!parsed.success) return { success: false, error: "Invalid request." };

    const existing = await prisma.user.findFirst({
      where: { id: parsed.data.userId, schoolId: scope.schoolId, role: { in: STAFF_ROLES } },
      select: { id: true },
    });
    if (!existing) return { success: false, error: "User not found in this school." };

    const tempPassword = randomBytes(6).toString("base64url"); // 8-char, shown once
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { passwordHash },
    });
    return { success: true, userId: parsed.data.userId, tempPassword };
  } catch {
    return { success: false, error: "Could not reset the password." };
  }
}