import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getNotifications } from "@/lib/notifications";
import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Questions assigned to you, review outcomes and reminders.",
};

// The feed changes with every assignment/review — never cache it.
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.id) redirect("/login");

  const feed = await getNotifications(session.id, { limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Question assignments, review outcomes and reminders — newest first.
          </p>
        </div>
      </div>

      <NotificationsClient
        initialItems={feed.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt ? item.readAt.toISOString() : null,
        }))}
        initialUnread={feed.unreadCount}
        initialTotal={feed.total}
      />
    </div>
  );
}
