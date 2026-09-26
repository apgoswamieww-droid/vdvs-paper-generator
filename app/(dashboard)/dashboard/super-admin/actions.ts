"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import { sendEmail, schoolCredentialsEmail } from "@/lib/email";
import type { EmailResult } from "@/lib/email";
import type { Medium, PlanTier, School, SchoolBoard, UserRole } from "@prisma/client";

// ============================================================
//  SUPER ADMIN — Platform-level Server Actions
//
//  Isolation rules:
//  • Every action below calls requireSuperAdmin() first, so only
//    SUPER_ADMIN sessions can reach them.
//  • Queries intentionally do NOT filter by schoolId — the super
//    admin views all tenants. Tenant-scoped queries (school admin,
//    teacher, student) all live behind requireSession() which is
//    rejected for SUPER_ADMIN by design.
// ============================================================

const PLAN_TIERS = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;

const onboardSchema = z.object({
  name: z.string().trim().min(2, "School name must be at least 2 characters.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,49}$/, "Slug can only contain lowercase letters, numbers and hyphens.")
    .or(z.literal("")),
  adminName: z.string().trim().min(2, "Admin name must be at least 2 characters.").max(80),
  adminEmail: z.string().toLowerCase().trim().email("Enter a valid email address."),
  planTier: z.enum(PLAN_TIERS).default("FREE"),
  autoCreateClasses: z.boolean().default(true),
});

export type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  isActive: boolean;
  createdAt: Date;
  teachers: number;
  students: number;
};

export type OnboardResult = {
  success: boolean;
  error?: string;
  school?: { id: string; name: string; slug: string; planTier: PlanTier };
  credentials?: { email: string; password: string };
  emailStatus?: EmailResult["status"];
  emailReason?: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "school";
  let counter = 2;
  while (await prisma.school.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

// ─────────────────────────────────────────────────────────
//  Platform analytics — global, cross-tenant
// ─────────────────────────────────────────────────────────
export async function getPlatformStats() {
  await requireSuperAdmin();

  const [totalSchools, activeSchools, totalQuestions, totalPapers, publishedPapers, userCounts] =
    await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { isActive: true } }),
      prisma.question.count(),
      prisma.paper.count(),
      prisma.paper.count({ where: { status: "PUBLISHED" } }),
      prisma.user.groupBy({
        by: ["role"],
        where: { role: { in: ["TEACHER", "STUDENT"] } },
        _count: { _all: true },
      }),
    ]);

  const teachers = userCounts.find((r) => r.role === "TEACHER")?._count._all ?? 0;
  const students = userCounts.find((r) => r.role === "STUDENT")?._count._all ?? 0;

  return {
    totalSchools,
    activeSchools,
    suspendedSchools: totalSchools - activeSchools,
    totalQuestions,
    totalPapers,
    publishedPapers,
    totalTeachers: teachers,
    totalStudents: students,
  };
}

// ─────────────────────────────────────────────────────────
//  Schools management table — all tenants
// ─────────────────────────────────────────────────────────
export async function listAllSchools(): Promise<SchoolRow[]> {
  await requireSuperAdmin();

  const [schools, userCounts] = await Promise.all([
    prisma.school.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        planTier: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.user.groupBy({
      by: ["schoolId", "role"],
      where: { role: { in: ["TEACHER", "STUDENT"] } },
      _count: { _all: true },
    }),
  ]);

  const bySchoolRole = new Map<string, { teachers: number; students: number }>();
  for (const row of userCounts) {
    const entry = bySchoolRole.get(row.schoolId) ?? { teachers: 0, students: 0 };
    if (row.role === "TEACHER") entry.teachers = row._count._all;
    if (row.role === "STUDENT") entry.students = row._count._all;
    bySchoolRole.set(row.schoolId, entry);
  }

  return schools.map((s) => {
    const counts = bySchoolRole.get(s.id) ?? { teachers: 0, students: 0 };
    return { ...s, teachers: counts.teachers, students: counts.students };
  });
}

// ─────────────────────────────────────────────────────────
//  Onboard a new school tenant
//  Creates: School → default ClassLevels → first SCHOOL_ADMIN
// ─────────────────────────────────────────────────────────
export async function onboardSchool(raw: unknown): Promise<OnboardResult> {
  try {
    await requireSuperAdmin();
    // The super admin session may be a NextAuth job — intentionally not tenant-scoped.
  } catch {
    return { success: false, error: "Forbidden: super admin access only." };
  }

  const parsed = onboardSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;
  const planTier: PlanTier = input.planTier;

  const emailTaken = await prisma.user.findUnique({
    where: { email: input.adminEmail },
    select: { id: true },
  });
  if (emailTaken) {
    return { success: false, error: `The email "${input.adminEmail}" is already registered on another account.` };
  }

  const slug = await uniqueSlug(input.slug || slugify(input.name));
  const password = randomBytes(6).toString("base64url"); // 8-char alphanumeric
  const passwordHash = await bcrypt.hash(password, 12);

  const defaultClasses = ["Std 6", "Std 7", "Std 8", "Std 9", "Std 10", "Std 11", "Std 12"];

  try {
    const school = await prisma.$transaction(async (tx) => {
      const createdSchool = await tx.school.create({
        data: {
          name: input.name,
          slug,
          planTier,
          isActive: true,
        },
      });

      if (input.autoCreateClasses) {
        await tx.classLevel.createMany({
          data: defaultClasses.map((name, i) => ({
            name,
            order: i,
            schoolId: createdSchool.id,
          })),
        });
      }

      await tx.user.create({
        data: {
          name: input.adminName,
          email: input.adminEmail,
          passwordHash,
          role: "SCHOOL_ADMIN" as UserRole,
          schoolId: createdSchool.id,
          isActive: true,
        },
      });

      return createdSchool;
    });

    revalidatePath("/dashboard/super-admin");

    const email = await sendEmail({
      ...schoolCredentialsEmail({
        schoolName: school.name,
        adminName: input.adminName,
        email: input.adminEmail,
        password,
      }),
      to: input.adminEmail,
    });

    return {
      success: true,
      school: { id: school.id, name: school.name, slug: school.slug, planTier: school.planTier },
      credentials: { email: input.adminEmail, password },
      emailStatus: email.status,
      emailReason: email.status === "sent" ? undefined : email.reason,
    };
  } catch {
    return { success: false, error: "Could not onboard the school. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────
//  Suspend / activate a tenant school
// ─────────────────────────────────────────────────────────
export async function setSchoolStatus(input: { schoolId: string; isActive: boolean }) {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Forbidden: super admin access only." };
  }

  if (!input.schoolId || typeof input.isActive !== "boolean") {
    return { success: false, error: "Invalid request." };
  }

  try {
    const school: School = await prisma.school.update({
      where: { id: input.schoolId },
      data: { isActive: input.isActive },
    });
    revalidatePath("/dashboard/super-admin");
    return { success: true, schoolId: school.id, isActive: school.isActive };
  } catch {
    return { success: false, error: "Could not update the school." };
  }
}

// ─────────────────────────────────────────────────────────
//  School detail — full tenant + usage numbers, for the
//  super-admin "View" dialog
// ─────────────────────────────────────────────────────────
export type SchoolDetail = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  planTier: PlanTier;
  isActive: boolean;
  board: SchoolBoard;
  academicYear: string | null;
  watermarkText: string | null;
  defaultInstructions: string | null;
  allowSelfRegistration: boolean;
  teacherCanEdit: boolean;
  mediums: Medium[];
  createdAt: Date;
  updatedAt: Date;
  counts: {
    teachers: number;
    students: number;
    admins: number;
    classes: number;
    subjects: number;
    papers: number;
    questions: number;
    assignments: number;
  };
  adminUsers: Array<{
    id: string;
    name: string | null;
    email: string;
    isActive: boolean;
    createdAt: Date;
  }>;
  subscription: {
    planTier: PlanTier;
    status: string;
    currentPeriodEnd: Date | null;
  } | null;
};

export async function getSchoolDetail(schoolId: string): Promise<SchoolDetail | null> {
  try {
    await requireSuperAdmin();
  } catch {
    return null;
  }

  if (!schoolId) return null;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: { subscription: true },
  });
  if (!school) return null;

  const [roleCounts, classes, subjects, papers, questions, assignments, adminUsers] =
    await Promise.all([
      prisma.user.groupBy({
        by: ["role"],
        where: { schoolId },
        _count: { _all: true },
      }),
      prisma.classLevel.count({ where: { schoolId } }),
      prisma.subject.count({ where: { schoolId } }),
      prisma.paper.count({ where: { schoolId } }),
      prisma.question.count({ where: { schoolId } }),
      prisma.paperAssignment.count({ where: { schoolId } }),
      prisma.user.findMany({
        where: { schoolId, role: "SCHOOL_ADMIN" },
        select: { id: true, name: true, email: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const countFor = (role: "TEACHER" | "STUDENT" | "SCHOOL_ADMIN") =>
    roleCounts.find((r) => r.role === role)?._count._all ?? 0;

  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    logoUrl: school.logoUrl,
    address: school.address,
    phone: school.phone,
    website: school.website,
    planTier: school.planTier,
    isActive: school.isActive,
    board: school.board,
    academicYear: school.academicYear,
    watermarkText: school.watermarkText,
    defaultInstructions: school.defaultInstructions,
    allowSelfRegistration: school.allowSelfRegistration,
    teacherCanEdit: school.teacherCanEdit,
    mediums: school.mediums,
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
    counts: {
      teachers: countFor("TEACHER"),
      students: countFor("STUDENT"),
      admins: countFor("SCHOOL_ADMIN"),
      classes,
      subjects,
      papers,
      questions,
      assignments,
    },
    adminUsers,
    subscription: school.subscription
      ? {
          planTier: school.subscription.planTier,
          status: school.subscription.status,
          currentPeriodEnd: school.subscription.currentPeriodEnd,
        }
      : null,
  };
}

// ─────────────────────────────────────────────────────────
//  Edit a school tenant — the super-admin "Edit" dialog
// ─────────────────────────────────────────────────────────
const BOARDS = ["GSEB", "CBSE"] as const;
const MEDIUMS = ["ENGLISH", "GUJARATI"] as const;

const updateSchoolSchema = z.object({
  id: z.string().min(1, "School id is required."),
  name: z.string().trim().min(2, "School name must be at least 2 characters.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,49}$/, "Slug can only contain lowercase letters, numbers and hyphens."),
  logoUrl: z.string().trim().max(4000000).nullish(), // URLs or self-uploaded data-URLs
  address: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(40).nullish(),
  website: z.string().trim().max(200).nullish(),
  planTier: z.enum(PLAN_TIERS),
  isActive: z.boolean(),
  board: z.enum(BOARDS),
  academicYear: z.string().trim().max(20).nullish(),
  watermarkText: z.string().trim().max(100).nullish(),
  defaultInstructions: z.string().trim().max(5000).nullish(),
  allowSelfRegistration: z.boolean(),
  teacherCanEdit: z.boolean(),
  mediums: z.array(z.enum(MEDIUMS)).min(1, "Select at least one medium."),
  adminEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").optional(),
});

export type UpdateSchoolResult = {
  success: boolean;
  error?: string;
  school?: { id: string; name: string; slug: string };
};

export async function updateSchool(raw: unknown): Promise<UpdateSchoolResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Forbidden: super admin access only." };
  }

  const parsed = updateSchoolSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  try {
    const existing = await prisma.school.findUnique({
      where: { id: input.id },
      select: { id: true, slug: true },
    });
    if (!existing) {
      return { success: false, error: "School not found." };
    }

    if (existing.slug !== input.slug) {
      const collision = await prisma.school.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (collision) {
        return { success: false, error: `The subdomain "${input.slug}" is already taken.` };
      }
    }

    const primaryAdmin =
      input.adminEmail !== undefined
        ? await prisma.user.findFirst({
            where: { schoolId: input.id, role: "SCHOOL_ADMIN" },
            orderBy: { createdAt: "asc" },
            select: { id: true, email: true },
          })
        : null;

    if (input.adminEmail !== undefined && !primaryAdmin) {
      return {
        success: false,
        error: "This school has no admin account yet, so its email can't be edited.",
      };
    }

    if (primaryAdmin && input.adminEmail !== undefined) {
      const taken = await prisma.user.findUnique({
        where: { email: input.adminEmail },
        select: { id: true },
      });
      if (taken && taken.id !== primaryAdmin.id) {
        return {
          success: false,
          error: `The email "${input.adminEmail}" is already registered on another account.`,
        };
      }
    }

    const school = await prisma.$transaction(async (tx) => {
      const updated = await tx.school.update({
        where: { id: input.id },
        data: {
          name: input.name,
          slug: input.slug,
          logoUrl: input.logoUrl || null,
          address: input.address || null,
          phone: input.phone || null,
          website: input.website || null,
          planTier: input.planTier,
          isActive: input.isActive,
          board: input.board,
          academicYear: input.academicYear || null,
          watermarkText: input.watermarkText || null,
          defaultInstructions: input.defaultInstructions || null,
          allowSelfRegistration: input.allowSelfRegistration,
          teacherCanEdit: input.teacherCanEdit,
          mediums: input.mediums,
        },
      });

      if (primaryAdmin && input.adminEmail !== undefined) {
        await tx.user.update({
          where: { id: primaryAdmin.id },
          data: { email: input.adminEmail },
        });
      }

      return updated;
    });

    revalidatePath("/dashboard/super-admin");
    return { success: true, school: { id: school.id, name: school.name, slug: school.slug } };
  } catch {
    return { success: false, error: "Could not update the school." };
  }
}