// ============================================================
//  Admin-scope resolution — strict tenant isolation
//
//  School-admin management modules are tenant-scoped. The scope is
//  ALWAYS resolved from the authenticated session:
//    • SCHOOL_ADMIN  → their own schoolId (never taken from input)
//    • SUPER_ADMIN   → an explicit audit schoolId (platform owner
//                      auditing a tenant, like the SaaS panel)
//    • TEACHER/…     → rejected
//  Every Server Action + page in /dashboard/admin/* calls
//  resolveAdminScope() before touching the database.
// ============================================================

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { UserRole } from "@/types";

export type AdminScope = {
  schoolId: string;
  role: Extract<UserRole, "SCHOOL_ADMIN" | "SUPER_ADMIN">;
};

type AuthSessionUser = {
  id?: string | null;
  role?: UserRole | null;
  schoolId?: string | null;
};

export async function resolveAdminScope(
  requestedSchoolId?: string | null
): Promise<AdminScope> {
  const session = await auth();
  const user = (session?.user ?? null) as AuthSessionUser | null;

  if (!user?.id) {
    throw new Error("Unauthorized: no active session.");
  }

  if (user.role === "SCHOOL_ADMIN") {
    if (!user.schoolId) {
      throw new Error("Unauthorized: school admin has no tenant.");
    }
    return { schoolId: user.schoolId, role: "SCHOOL_ADMIN" };
  }

  if (user.role === "SUPER_ADMIN") {
    if (!requestedSchoolId) {
      throw new Error("A school audit context is required for super admin.");
    }
    const school = await prisma.school.findUnique({
      where: { id: requestedSchoolId },
      select: { id: true },
    });
    if (!school) {
      throw new Error("The requested school does not exist.");
    }
    return { schoolId: school.id, role: "SUPER_ADMIN" };
  }

  throw new Error("Forbidden: school admin access only.");
}