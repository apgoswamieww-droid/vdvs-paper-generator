import { Bell, CheckCircle, ClipboardCheck, Clock, UserPlus } from "lucide-react";

// ============================================================
//  Shared presentation for notification types — used by the
//  header bell and /dashboard/notifications.
// ============================================================

export type NotificationMeta = {
  icon: typeof Bell;
  color: string;
  bg: string;
  label: string;
};

export const NOTIFICATION_META: Record<string, NotificationMeta> = {
  QUESTION_ASSIGNED: {
    icon: ClipboardCheck,
    color: "text-secondary",
    bg: "bg-secondary/15",
    label: "Assigned for review",
  },
  QUESTION_REVIEWED: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    label: "Review finished",
  },
  QUESTION_UNASSIGNED: {
    icon: UserPlus,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    label: "Needs a reviewer",
  },
  REVIEW_REMINDER: {
    icon: Clock,
    color: "text-sky-400",
    bg: "bg-sky-500/15",
    label: "Reminder",
  },
};

export const TYPE_FALLBACK: NotificationMeta = {
  icon: Bell,
  color: "text-muted-foreground",
  bg: "bg-muted",
  label: "Notification",
};

export function metaFor(type: string): NotificationMeta {
  return NOTIFICATION_META[type] ?? TYPE_FALLBACK;
}
