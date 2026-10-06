// ============================================================
//  Notifications — in-app feed, browser push, optional email
//
//  Driven by per-school NotificationPreference rows (Admin →
//  Settings → Notifications); defaults apply when a row is absent.
//  Like lib/email.ts this module NEVER throws — a broken push
//  service or missing VAPID key must never fail the business
//  action that triggered a notification.
// ============================================================

import type { NotificationType, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { notificationEmail, sendEmail } from "@/lib/email";
import {
  DEFAULT_CHANNEL_PREFS,
  NOTIFICATION_EVENTS,
  defaultsFor,
  type ChannelPrefs,
} from "@/lib/notification-events";

// Re-exported so server code keeps a single import for notifications.
export { DEFAULT_CHANNEL_PREFS, NOTIFICATION_EVENTS } from "@/lib/notification-events";
export type { ChannelPrefs } from "@/lib/notification-events";

export type NotificationData = {
  url?: string;
  questionIds?: string[];
};

export type NotifyInput = {
  userId: string;
  schoolId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: NotificationData;
  /** Suppresses repeats — e.g. reminder:<bucket>. NULL = no dedupe. */
  dedupeKey?: string;
  /** Bypass preferences (used by the admin "send test" button). */
  force?: boolean;
};

export type NotifyResult = {
  created: boolean;
  skipped?: string;
  pushSent?: number;
  pushFailed?: number;
  emailStatus?: string;
};

/** Exactly what public/sw.js receives on a push event. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  type: NotificationType;
};

// ── Pure helpers (unit-tested) ─────────────────────────────

const HOUR_MS = 3_600_000;

export function reminderHoursOf(pref: ChannelPrefs): number {
  return Math.max(1, pref.reminderHours || DEFAULT_CHANNEL_PREFS.reminderHours);
}

/** Bucket index so one reminder is sent per reminderHours window. */
export function reminderBucket(reminderHours: number, now: number = Date.now()): number {
  return Math.floor(now / (reminderHoursOf({ ...DEFAULT_CHANNEL_PREFS, reminderHours }) * HOUR_MS));
}

/** Questions older than this are overdue for a reminder. */
export function reminderCutoff(reminderHours: number, now: number = Date.now()): Date {
  return new Date(now - reminderHoursOf({ ...DEFAULT_CHANNEL_PREFS, reminderHours }) * HOUR_MS);
}

export function absoluteUrl(path?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!path) return base;
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function buildPushPayload(input: {
  title: string;
  body?: string;
  url?: string;
  type: NotificationType;
}): PushPayload {
  return {
    title: input.title,
    body: input.body ?? "",
    url: input.url ?? "/dashboard",
    tag: `${input.type}:${input.url ?? ""}`.slice(0, 120),
    type: input.type,
  };
}

// ── Preferences ────────────────────────────────────────────

export async function resolvePreferences(
  schoolId: string,
  event: NotificationType
): Promise<ChannelPrefs> {
  try {
    const row = await prisma.notificationPreference.findUnique({
      where: { schoolId_event: { schoolId, event } },
    });
    if (!row) return defaultsFor(event);
    return {
      inApp: row.inApp,
      push: row.push,
      email: row.email,
      reminderHours: row.reminderHours || DEFAULT_CHANNEL_PREFS.reminderHours,
    };
  } catch {
    return { ...DEFAULT_CHANNEL_PREFS };
  }
}

/** Admin Settings → Notifications (defaults are materialised on first save). */
export async function listPreferences(schoolId: string): Promise<
  { event: NotificationType; prefs: ChannelPrefs }[]
> {
  const rows = await prisma.notificationPreference.findMany({ where: { schoolId } });
  const byEvent = new Map(rows.map((r) => [r.event, r]));
  return NOTIFICATION_EVENTS.map(({ value }) => {
    const row = byEvent.get(value);
    return {
      event: value,
      prefs: row
        ? {
            inApp: row.inApp,
            push: row.push,
            email: row.email,
            reminderHours: row.reminderHours || DEFAULT_CHANNEL_PREFS.reminderHours,
          }
        : defaultsFor(value),
    };
  });
}

export async function savePreferences(
  schoolId: string,
  entries: { event: NotificationType; prefs: ChannelPrefs }[]
): Promise<void> {
  for (const { event, prefs } of entries) {
    await prisma.notificationPreference.upsert({
      where: { schoolId_event: { schoolId, event } },
      create: {
        schoolId,
        event,
        inApp: prefs.inApp,
        push: prefs.push,
        email: prefs.email,
        reminderHours: Math.max(1, prefs.reminderHours || 24),
      },
      update: {
        inApp: prefs.inApp,
        push: prefs.push,
        email: prefs.email,
        reminderHours: Math.max(1, prefs.reminderHours || 24),
      },
    });
  }
}

// ── Dedupe (in-memory guard on top of the DB unique index) ─

const RECENT_TTL_MS = 6 * HOUR_MS;
const recentSends = new Map<string, number>();

function seenRecently(key: string): boolean {
  const at = recentSends.get(key);
  if (!at) return false;
  if (Date.now() - at > RECENT_TTL_MS) {
    recentSends.delete(key);
    return false;
  }
  return true;
}

function markSent(key: string): void {
  recentSends.set(key, Date.now());
  if (recentSends.size > 500) {
    for (const [k, at] of recentSends) {
      if (Date.now() - at > RECENT_TTL_MS) recentSends.delete(k);
    }
  }
}

/** Test seam — clears the in-memory reminder guard. */
export function resetNotificationDedupe(): void {
  recentSends.clear();
}

// ── Push delivery ──────────────────────────────────────────

function vapidConfig():
  | { publicKey: string; privateKey: string; subject: string }
  | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@localhost";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function pushConfigured(): boolean {
  return vapidConfig() !== null;
}

async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; skipped?: string }> {
  const vapid = vapidConfig();
  if (!vapid) return { sent: 0, failed: 0, skipped: "VAPID keys are not configured" };

  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch {
    return { sent: 0, failed: 0, skipped: "push subscriptions unavailable" };
  }
  if (subs.length === 0) return { sent: 0, failed: 0, skipped: "device not subscribed" };

  // Imported lazily so a missing/broken web-push install never breaks notifications.
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 4 * HOUR_MS }
      );
      sent += 1;
      prisma.pushSubscription
        .update({ where: { id: sub.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = the browser dropped this subscription; forget it.
      if (status === 404 || status === 410) {
        prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        failed += 1;
      }
    }
  }
  return { sent, failed };
}

// ── Notify ─────────────────────────────────────────────────

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const prefs = input.force
      ? { ...DEFAULT_CHANNEL_PREFS, email: false }
      : await resolvePreferences(input.schoolId, input.type);

    if (!prefs.inApp && !prefs.push && !prefs.email) {
      return { created: false, skipped: "disabled" };
    }

    const dedupeIndexKey = input.dedupeKey ? `${input.userId}:${input.dedupeKey}` : null;
    if (dedupeIndexKey) {
      if (seenRecently(dedupeIndexKey)) return { created: false, skipped: "duplicate" };
      const existing = await prisma.notification.findUnique({
        where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey! } },
        select: { id: true },
      });
      if (existing) return { created: false, skipped: "duplicate" };
    }

    let created = false;
    if (prefs.inApp) {
      try {
        await prisma.notification.create({
          data: {
            schoolId: input.schoolId,
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
            dedupeKey: input.dedupeKey ?? null,
          },
        });
        created = true;
      } catch {
        // Unique-concurrent duplicate or DB hiccup — treat as "already delivered".
        return { created: false, skipped: "duplicate-or-db" };
      }
    }

    let pushSent: number | undefined;
    let pushFailed: number | undefined;
    if (prefs.push) {
      const result = await sendPushToUser(
        input.userId,
        buildPushPayload({
          title: input.title,
          body: input.body,
          url: input.data?.url,
          type: input.type,
        })
      );
      if (result.skipped !== undefined) {
        pushSent = 0;
        pushFailed = 0;
      } else {
        pushSent = result.sent;
        pushFailed = result.failed;
      }
    }

    let emailStatus: string | undefined;
    if (prefs.email) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true },
        });
        if (user?.email) {
          const mail = notificationEmail({
            title: input.title,
            body: input.body ?? "",
            url: absoluteUrl(input.data?.url ?? "/dashboard"),
          });
          const res = await sendEmail({ to: user.email, ...mail });
          emailStatus = res.status;
        } else {
          emailStatus = "skipped-no-address";
        }
      } catch {
        emailStatus = "failed";
      }
    }

    if (dedupeIndexKey) markSent(dedupeIndexKey);

    return { created, pushSent, pushFailed, emailStatus };
  } catch {
    return { created: false, skipped: "error" };
  }
}

/** Send to several recipients, dropping exact duplicates. */
export async function notifyMany(inputs: NotifyInput[]): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const key = `${input.userId}|${input.type}|${input.title}|${input.dedupeKey ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(await notify(input));
  }
  return results;
}

// ── Feed reads ─────────────────────────────────────────────

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  url: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function getNotifications(
  userId: string,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{ items: NotificationListItem[]; unreadCount: number; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const where = {
    userId,
    ...(opts.unreadOnly ? { readAt: null } : {}),
  };

  const [rows, unreadCount, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.offset ?? 0,
      take: limit,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      url: readUrl(r.data),
      readAt: r.readAt,
      createdAt: r.createdAt,
    })),
    unreadCount,
    total,
  };
}

function readUrl(data: Prisma.JsonValue | null): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const url = (data as { url?: unknown }).url;
  return typeof url === "string" ? url : null;
}

export async function markNotificationsRead(
  userId: string,
  id?: string
): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

// ── Reminder sweep ─────────────────────────────────────────

const SWEEP_INTERVAL_MS = 5 * 60_000;
const lastSweepAt = new Map<string, number>();

/**
 * Lazy scheduler: finds PENDING questions assigned to a teacher for longer
 * than the configured reminderHours and nudges them (once per window).
 * Throttled per school in-process — there is no job runner in this app, so
 * it is driven by open tabs polling /api/notifications.
 */
export async function sweepReminders(
  schoolId?: string,
  opts: { force?: boolean } = {}
): Promise<{ notified: number; scanned: number }> {
  const throttleKey = schoolId ?? "*";
  const now = Date.now();
  if (!opts.force) {
    const last = lastSweepAt.get(throttleKey) ?? 0;
    if (now - last < SWEEP_INTERVAL_MS) return { notified: 0, scanned: 0 };
    lastSweepAt.set(throttleKey, now);
  }

  let notified = 0;
  let scanned = 0;
  try {
    const schoolIds = schoolId
      ? [schoolId]
      : await prisma.question
          .findMany({
            where: { status: "PENDING", assignedTeacherId: { not: null } },
            distinct: ["schoolId"],
            select: { schoolId: true },
            take: 25,
          })
          .then((rows) => rows.map((r) => r.schoolId));

    for (const sid of schoolIds) {
      const pref = await resolvePreferences(sid, "REVIEW_REMINDER");
      if (!pref.inApp && !pref.push) continue;

      const hours = reminderHoursOf(pref);
      const overdue = await prisma.question.findMany({
        where: {
          schoolId: sid,
          status: "PENDING",
          assignedTeacherId: { not: null },
          createdAt: { lt: reminderCutoff(hours, now) },
        },
        select: { id: true, assignedTeacherId: true },
        take: 200,
      });
      if (overdue.length === 0) continue;

      const byTeacher = new Map<string, string[]>();
      for (const q of overdue) {
        if (!q.assignedTeacherId) continue;
        const list = byTeacher.get(q.assignedTeacherId) ?? [];
        list.push(q.id);
        byTeacher.set(q.assignedTeacherId, list);
      }

      for (const [teacherId, questionIds] of byTeacher) {
        scanned += questionIds.length;
        const count = questionIds.length;
        const result = await notify({
          userId: teacherId,
          schoolId: sid,
          type: "REVIEW_REMINDER",
          title:
            count === 1
              ? "1 question is still awaiting your review"
              : `${count} questions are still awaiting your review`,
          body: `Pending for more than ${hours} hour${hours === 1 ? "" : "s"} — open your review queue to approve or reject them.`,
          data: { url: "/dashboard/teacher/questions/review", questionIds },
          dedupeKey: `reminder:${reminderBucket(hours, now)}`,
        });
        if (result.created) notified += 1;
      }
    }
  } catch {
    // never throw — a reminder sweep must not break the request that triggered it
  }
  return { notified, scanned };
}
