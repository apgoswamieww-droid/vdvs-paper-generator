"use client";

// ============================================================
//  useNotifications — the header bell's data source.
//
//  Polls GET /api/notifications every 30s (plus on tab focus),
//  toasts genuinely-new items, and keeps the unread badge in sync.
//  There is no WebSocket/SSE layer in this app, so polling is the
//  delivery mechanism for open tabs; closed tabs get web push from
//  the service worker instead.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getPushState, disablePush, enablePush, type PushState } from "@/lib/push-client";

export type FeedItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;
const FEED_URL = "/api/notifications?limit=20";

export function timeAgo(iso: string | Date): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString();
}

export type NotificationsApi = {
  items: FeedItem[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  push: PushState;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<boolean>;
  pushBusy: boolean;
};

export function useNotifications(): NotificationsApi {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [push, setPush] = useState<PushState>({
    supported: false,
    permission: "unsupported",
    subscribed: false,
  });
  const [pushBusy, setPushBusy] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(FEED_URL, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as {
        items?: FeedItem[];
        unreadCount?: number;
      };
      if (!mounted.current) return;

      const list = data.items ?? [];
      const unread = data.unreadCount ?? 0;

      if (primed.current) {
        for (const item of list) {
          if (!seenIds.current.has(item.id) && !item.readAt) {
            toast(item.title, {
              description: item.body ?? undefined,
              duration: 8000,
              action: {
                label: "Open",
                onClick: () => {
                  if (item.url) window.location.assign(item.url);
                },
              },
            });
          }
        }
      } else {
        for (const item of list) seenIds.current.add(item.id);
        primed.current = true;
      }

      for (const item of list) seenIds.current.add(item.id);
      setItems(list);
      setUnreadCount(unread);
      setLoading(false);
    } catch {
      // network hiccup — keep the last known feed
    }
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      const previous = items;
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch {
        setItems(previous); // roll back so the badge stays truthful
      }
    },
    [items]
  );

  const markAllRead = useCallback(async () => {
    const previous = items;
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      setItems(previous);
    }
  }, [items]);

  const enablePushAction = useCallback(async () => {
    setPushBusy(true);
    try {
      const result = await enablePush();
      setPush(await getPushState());
      return result.ok;
    } finally {
      setPushBusy(false);
    }
  }, []);

  const disablePushAction = useCallback(async () => {
    setPushBusy(true);
    try {
      const result = await disablePush();
      setPush(await getPushState());
      return result.ok;
    } finally {
      setPushBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Deferred so the first poll runs as a callback, not synchronously in the
    // effect body (react-hooks/set-state-in-effect).
    const kick = window.setTimeout(() => void refresh(), 0);
    void getPushState().then((state) => {
      if (mounted.current) setPush(state);
    });

    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted.current = false;
      window.clearTimeout(kick);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return {
    items,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    push,
    enablePush: enablePushAction,
    disablePush: disablePushAction,
    pushBusy,
  };
}
