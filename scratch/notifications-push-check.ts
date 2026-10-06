// Temporary check: a real web-push delivery to the browser subscribed
// by scratch/notifications-e2e.ts.
// Run: npx tsx scratch/notifications-push-check.ts
import prisma from "@/lib/prisma";
import { notify } from "@/lib/notifications";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "SCHOOL_ADMIN", isActive: true, schoolId: { not: "" } },
    select: { id: true, name: true, schoolId: true },
  });
  if (!admin?.schoolId) throw new Error("No active SCHOOL_ADMIN found");

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: admin.id },
    select: { platform: true, lastSeenAt: true, createdAt: true },
  });
  console.log("subscriptions:", JSON.stringify(subs));

  const result = await notify({
    userId: admin.id,
    schoolId: admin.schoolId,
    type: "REVIEW_REMINDER",
    title: "Push delivery check",
    body: "Sent from scratch/notifications-push-check.ts",
    data: { url: "/dashboard/notifications" },
    force: true,
  });
  console.log("notify:", JSON.stringify(result));

  const tests = await prisma.notification.count({
    where: { userId: admin.id, title: "Test notification" },
  });
  console.log("test notifications in feed:", tests);

  const prefs = await prisma.notificationPreference.findMany({
    where: { schoolId: admin.schoolId },
    select: { event: true, inApp: true, push: true, email: true, reminderHours: true },
    orderBy: { event: "asc" },
  });
  console.log("prefs:", JSON.stringify(prefs));
}

main()
  .catch((error) => {
    console.error("FAILED", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
