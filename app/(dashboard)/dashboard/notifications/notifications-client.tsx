"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { metaFor } from "@/components/dashboard/notification-meta";
import { timeAgo, type FeedItem } from "@/components/dashboard/use-notifications";

// ============================================================
//  Notification feed — /dashboard/notifications
//  Same data as the header bell, with an unread filter and
//  mark-all-read. Clicking a row marks it read and follows its link.
// ============================================================

export function NotificationsClient({
  initialItems,
  initialUnread,
  initialTotal,
}: {
  initialItems: FeedItem[];
  initialUnread: number;
  initialTotal: number;
}) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const visible = unreadOnly ? items.filter((item) => !item.readAt) : items;

  function markRead(id: string) {
    const target = items.find((item) => item.id === id);
    if (!target || target.readAt) return;
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    void fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  function markAllRead() {
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    void fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border p-1">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={`rounded-md px-3 py-1 font-[Nunito] text-xs transition-colors ${
              !unreadOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={`rounded-md px-3 py-1 font-[Nunito] text-xs transition-colors ${
              unreadOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {unreadCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={markAllRead} className="font-[Nunito] text-xs">
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/40">
        {visible.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="font-[Rasa] text-base font-semibold">
              {unreadOnly ? "You're all caught up" : "No notifications yet"}
            </p>
            <p className="mx-auto mt-2 max-w-sm font-[Nunito] text-xs text-muted-foreground">
              {unreadOnly
                ? "There are no unread notifications right now."
                : "When questions are assigned to you for review, or an admin acts on your reviews, they will show up here."}
            </p>
          </div>
        )}

        {visible.map((item) => {
          const meta = metaFor(item.type);
          const Icon = meta.icon;
          const unread = !item.readAt;
          return (
            <Link
              key={item.id}
              href={item.url ?? "/dashboard/notifications"}
              onClick={() => markRead(item.id)}
              className={`flex items-start gap-4 px-4 py-4 transition-colors hover:bg-muted/50 ${
                unread ? "bg-secondary/5" : ""
              }`}
            >
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
              >
                <Icon className={`h-4.5 w-4.5 ${meta.color}`} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-[Nunito] text-sm font-semibold">{item.title}</p>
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-[Nunito] text-[10px] text-muted-foreground">
                    {meta.label}
                  </span>
                  {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />}
                </div>
                {item.body && (
                  <p className="mt-0.5 font-[Nunito] text-xs leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                )}
              </div>

              <span className="shrink-0 font-[Nunito] text-[11px] text-muted-foreground/70">
                {timeAgo(item.createdAt)}
              </span>
            </Link>
          );
        })}
      </div>

      {initialTotal > items.length && (
        <p className="text-center font-[Nunito] text-xs text-muted-foreground">
          Showing the latest {items.length} of {initialTotal} notifications.
        </p>
      )}
    </div>
  );
}
