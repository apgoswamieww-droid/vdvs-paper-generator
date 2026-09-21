// ============================================================
//  Session helper — DEV STUB
//
//  ⚠️  Phase 2 dev placeholder. Replace with NextAuth (Auth.js)
//      when auth is wired up. Every Server Action MUST go through
//      requireSession() so tenant scoping (schoolId) is enforced
//      even before real auth exists.
// ============================================================

import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import type { SessionUser, TenantContext } from "@/types";

const DEV_SESSION_COOKIE = "papergen_dev_session";

/**
 * Resolves the current session user.
 *
 * Dev behavior:
 *  - If a `papergen_dev_session` cookie holds a user email, that
 *    user is loaded (scoped to their school).
 *  - Otherwise falls back to the seeded demo admin.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const email = cookieStore.get(DEV_SESSION_COOKIE)?.value;

  const user = await prisma.user.findFirst({
    where: email ? { email, isActive: true } : { isActive: true, role: "SCHOOL_ADMIN" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
      schoolId: true,
    },
  });

  if (!user) return null;
  return user as SessionUser;
}

/**
 * Guard for Server Actions / pages: throws if there is no session.
 * Returns the session user + tenant context.
 */
export async function requireSession(): Promise<SessionUser & TenantContext> {
  const user = await getSession();
  if (!user) {
    throw new Error("Unauthorized: no active session. Seed the demo school first (npm run db:seed).");
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
