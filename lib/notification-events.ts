// ============================================================
//  Notification events + channel defaults — PURE data.
//
//  Kept separate from lib/notifications.ts (which imports Prisma)
//  so client components — the admin Settings → Notifications tab
//  — can import the event list without pulling the server-only
//  database layer into the browser bundle.
// ============================================================

import type { NotificationType } from "@prisma/client";

export type ChannelPrefs = {
  inApp: boolean;
  push: boolean;
  email: boolean;
  reminderHours: number;
};

/** Fallback when neither an event default nor a saved row applies. */
export const DEFAULT_CHANNEL_PREFS: ChannelPrefs = {
  inApp: true,
  push: true,
  email: false,
  reminderHours: 24,
};

/**
 * Per-event defaults, materialised only when an admin saves the tab.
 * In-app is always on; push is on for assignment + reminders (a teacher
 * must not miss them) and off for admin-facing outcomes; email stays
 * off until SMTP is configured.
 */
export const EVENT_DEFAULTS: Record<NotificationType, ChannelPrefs> = {
  QUESTION_ASSIGNED: { inApp: true, push: true, email: false, reminderHours: 24 },
  QUESTION_REVIEWED: { inApp: true, push: false, email: false, reminderHours: 24 },
  QUESTION_UNASSIGNED: { inApp: true, push: false, email: false, reminderHours: 24 },
  REVIEW_REMINDER: { inApp: true, push: true, email: false, reminderHours: 24 },
};

/** Events an admin can toggle, with the labels used in the settings UI. */
export const NOTIFICATION_EVENTS: {
  value: NotificationType;
  label: string;
  description: string;
}[] = [
  {
    value: "QUESTION_ASSIGNED",
    label: "Question assigned for review",
    description: "A teacher is told that questions were routed to their review queue.",
  },
  {
    value: "QUESTION_REVIEWED",
    label: "Question approved or rejected",
    description: "Admins are told when a teacher finishes reviewing a question.",
  },
  {
    value: "QUESTION_UNASSIGNED",
    label: "AI questions need a reviewer",
    description: "Admins are told when AI questions were saved without a teacher.",
  },
  {
    value: "REVIEW_REMINDER",
    label: "Review reminder",
    description: "Nudges teachers about questions still pending after the set hours.",
  },
];

export function defaultsFor(event: NotificationType): ChannelPrefs {
  return { ...(EVENT_DEFAULTS[event] ?? DEFAULT_CHANNEL_PREFS) };
}
