// ============================================================
//  Session helper — uses NextAuth (Phase 4)
// ============================================================

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { SessionUser, TenantContext, UserRole } from "@/types";

type AuthSessionUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: UserRole | null;
  schoolId?: string | null;
};

/**
 * Resolves the current session user via NextAuth.
 */
export async function getSession(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = session.user as unknown as AuthSessionUser;

  return {
    id: user.id ?? "",
    name: user.name ?? null,
    email: user.email ?? "",
    role: user.role ?? "TEACHER",
    avatarUrl: user.image ?? null,
    schoolId: user.schoolId ?? "",
  } as SessionUser;
}

/**
 * Guard for Server Actions / pages: throws if there is no session.
 *
 * Tenant isolation: a SUPER_ADMIN is explicitly NOT a tenant user — they have
 * no school scoping and must go through requireSuperAdmin() instead. This
 * guarantees every tenant-scoped query below this guard is filtered to the
 * caller's own school.
 */
export async function requireSession(): Promise<SessionUser & TenantContext> {
  const user = await getSession();
  if (!user) {
    throw new Error("Unauthorized: no active session.");
  }
  if (user.role === "SUPER_ADMIN") {
    throw new Error("Forbidden: super admin is not a tenant user.");
  }

  const schoolId = user.schoolId;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { slug: true, planTier: true, isActive: true },
  });

  if (!school || !school.isActive) {
    throw new Error("Unauthorized: school is inactive or missing.");
  }

  return { ...user, schoolId, schoolSlug: school.slug, planTier: school.planTier };
}

/**
 * Platform-owner guard for Super Admin pages / Server Actions.
 * Rejects SCHOOL_ADMIN / TEACHER / STUDENT sessions.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new Error("Unauthorized: no active session.");
  }
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: super admin access only.");
  }
  return user;
}
