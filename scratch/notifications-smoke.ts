// Temporary smoke check for the notification stack:
//   preferences -> notify -> sweep -> feed read.
// Run: npx tsx scratch/notifications-smoke.ts  (with .env loaded)
import prisma from "@/lib/prisma";
import {
  NOTIFICATION_EVENTS,
  getNotifications,
  listPreferences,
  notify,
  savePreferences,
  sweepReminders,
} from "@/lib/notifications";
import { defaultsFor } from "@/lib/notification-events";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "SCHOOL_ADMIN", isActive: true, schoolId: { not: "" } },
    select: { id: true, name: true, email: true, schoolId: true },
  });
  if (!admin?.schoolId) throw new Error("No active SCHOOL_ADMIN found");

  await savePreferences(
    admin.schoolId,
    NOTIFICATION_EVENTS.map((event) => ({ event: event.value, prefs: defaultsFor(event.value) }))
  );
  const prefs = await listPreferences(admin.schoolId);
  console.log(
    "prefs:",
    prefs
      .map(
        (p) =>
          `${p.event}=${p.prefs.inApp ? "inApp" : "-"}/${p.prefs.push ? "push" : "-"}/${
            p.prefs.email ? "email" : "-"
          }@${p.prefs.reminderHours}h`
      )
      .join("  ")
  );

  const result = await notify({
    userId: admin.id,
    schoolId: admin.schoolId,
    type: "QUESTION_ASSIGNED",
    title: "Smoke test — questions assigned to you",
    body: "Created by scratch/notifications-smoke.ts",
    data: { url: "/dashboard/notifications" },
    force: true,
  });
  console.log("notify:", JSON.stringify(result));

  console.log("sweep:", JSON.stringify(await sweepReminders(admin.schoolId, { force: true })));

  const feed = await getNotifications(admin.id, { limit: 5 });
  console.log("feed: unread=", feed.unreadCount, "total=", feed.total);
  console.log("latest:", feed.items[0]?.type, "-", feed.items[0]?.title);
  console.log("ADMIN_EMAIL=" + admin.email);
  console.log("ADMIN_SCHOOL=" + admin.schoolId);
}

main()
  .catch((error) => {
    console.error("FAILED", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
