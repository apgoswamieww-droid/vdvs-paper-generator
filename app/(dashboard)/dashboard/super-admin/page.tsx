import type { Metadata } from "next";
import { getPlatformStats, listAllSchools } from "./actions";
import { SuperAdminClient } from "./super-admin-client";

export const metadata: Metadata = {
  title: "Platform Control",
  description: "Super Admin SaaS control panel — schools, onboarding and platform analytics.",
};

export default async function SuperAdminPage() {
  const [stats, schools] = await Promise.all([getPlatformStats(), listAllSchools()]);
  return <SuperAdminClient stats={stats} schools={schools} />;
}