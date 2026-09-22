// ============================================================
//  Session helper — uses NextAuth (Phase 4)
// ============================================================

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { SessionUser, TenantContext } from "@/types";

/**
 * Resolves the current session user via NextAuth.
 */
export async function getSession(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  return {
    id: (session.user as any).id,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    role: (session.user as any).role,
    avatarUrl: session.user.image ?? null,
    schoolId: (session.user as any).schoolId,
  } as SessionUser;
}

/**
 * Guard for Server Actions / pages: throws if there is no session.
 */
export async function requireSession(): Promise<SessionUser & TenantContext> {
  const user = await getSession();
  if (!user) {
    throw new Error("Unauthorized: no active session.");
  }

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { slug: true, planTier: true, isActive: true },
  });

  if (!school || !school.isActive) {
    throw new Error("Unauthorized: school is inactive or missing.");
  }

  return { ...user, schoolSlug: school.slug, planTier: school.planTier };
}
