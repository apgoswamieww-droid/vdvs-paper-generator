import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = {
  title: "School Settings",
  description: "Advanced configuration for your school — branding, academics, papers and permissions.",
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const scope = await resolveAdminScope(params.schoolId);

  const school = await prisma.school.findUnique({
    where: { id: scope.schoolId },
    select: {
      name: true,
      slug: true,
      board: true,
      address: true,
      phone: true,
      website: true,
      logoUrl: true,
      academicYear: true,
      mediums: true,
      defaultInstructions: true,
      watermarkText: true,
      allowSelfRegistration: true,
      teacherCanEdit: true,
      planTier: true,
      isActive: true,
    },
  });

  if (!school) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        School not found.
      </div>
    );
  }

  return (
    <SettingsTabs
      school={{
        name: school.name,
        slug: school.slug,
        board: school.board,
        address: school.address ?? "",
        phone: school.phone ?? "",
        website: school.website ?? "",
        logoUrl: school.logoUrl ?? "",
        academicYear: school.academicYear ?? "",
        mediums: school.mediums as ("ENGLISH" | "GUJARATI")[],
        defaultInstructions: school.defaultInstructions ?? "",
        watermarkText: school.watermarkText ?? "",
        allowSelfRegistration: school.allowSelfRegistration,
        teacherCanEdit: school.teacherCanEdit,
        planTier: school.planTier,
        isActive: school.isActive,
      }}
      auditSchoolId={scope.role === "SUPER_ADMIN" ? scope.schoolId : null}
    />
  );
}