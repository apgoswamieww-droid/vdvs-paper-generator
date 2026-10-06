// ============================================================
//  Notification preferences — per-event defaults, reminder
//  window maths and the push payload sent to /sw.js.
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CHANNEL_PREFS,
  EVENT_DEFAULTS,
  NOTIFICATION_EVENTS,
  defaultsFor,
} from "@/lib/notification-events";
import {
  absoluteUrl,
  buildPushPayload,
  pushConfigured,
  reminderBucket,
  reminderCutoff,
  reminderHoursOf,
} from "@/lib/notifications";

const HOUR_MS = 3_600_000;

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("notification events", () => {
  it("covers every event exactly once", () => {
    const values = NOTIFICATION_EVENTS.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
    expect([...values].sort()).toEqual(Object.keys(EVENT_DEFAULTS).sort());
  });

  it("gives every event a label and description for the settings tab", () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(event.label.length).toBeGreaterThan(3);
      expect(event.description.length).toBeGreaterThan(10);
    }
  });

  it("keeps in-app on and email off by default", () => {
    for (const event of NOTIFICATION_EVENTS) {
      const prefs = defaultsFor(event.value);
      expect(prefs.inApp).toBe(true);
      expect(prefs.email).toBe(false);
      expect(prefs.reminderHours).toBe(24);
    }
  });

  it("pushes only the teacher-facing events by default", () => {
    expect(defaultsFor("QUESTION_ASSIGNED").push).toBe(true);
    expect(defaultsFor("REVIEW_REMINDER").push).toBe(true);
    expect(defaultsFor("QUESTION_REVIEWED").push).toBe(false);
    expect(defaultsFor("QUESTION_UNASSIGNED").push).toBe(false);
  });

  it("returns a copy so callers cannot mutate the shared defaults", () => {
    const prefs = defaultsFor("QUESTION_ASSIGNED");
    prefs.push = false;
    prefs.reminderHours = 3;
    expect(defaultsFor("QUESTION_ASSIGNED")).toEqual(EVENT_DEFAULTS.QUESTION_ASSIGNED);
    expect(DEFAULT_CHANNEL_PREFS.push).toBe(true);
    expect(DEFAULT_CHANNEL_PREFS.reminderHours).toBe(24);
  });
});

describe("reminder windows", () => {
  it("clamps the configured hours", () => {
    expect(reminderHoursOf({ ...DEFAULT_CHANNEL_PREFS, reminderHours: 6 })).toBe(6);
    expect(reminderHoursOf({ ...DEFAULT_CHANNEL_PREFS, reminderHours: 0 })).toBe(24);
    expect(reminderHoursOf({ ...DEFAULT_CHANNEL_PREFS, reminderHours: -3 })).toBe(1);
    expect(reminderHoursOf({ ...DEFAULT_CHANNEL_PREFS, reminderHours: 9999 })).toBe(9999);
  });

  it("keeps one bucket per reminder window", () => {
    const hours = 24;
    const dayStart = Date.UTC(2026, 9, 6); // midnight UTC
    expect(reminderBucket(hours, dayStart)).toBe(reminderBucket(hours, dayStart + hours * HOUR_MS - 1));
    expect(reminderBucket(hours, dayStart)).not.toBe(
      reminderBucket(hours, dayStart + hours * HOUR_MS)
    );
  });

  it("cuts off overdue questions at exactly the window", () => {
    const now = Date.UTC(2026, 9, 6, 12);
    expect(reminderCutoff(6, now).getTime()).toBe(now - 6 * HOUR_MS);
    expect(reminderCutoff(24, now).getTime()).toBe(now - 24 * HOUR_MS);
  });
});

describe("push payload", () => {
  it("defaults the url to the dashboard", () => {
    expect(buildPushPayload({ title: "T", type: "QUESTION_ASSIGNED" })).toEqual({
      title: "T",
      body: "",
      url: "/dashboard",
      tag: "QUESTION_ASSIGNED:",
      type: "QUESTION_ASSIGNED",
    });
  });

  it("tags the notification by type and url so repeats collapse", () => {
    const payload = buildPushPayload({
      title: "Review ready",
      body: "1 question",
      url: "/dashboard/teacher/questions/review",
      type: "REVIEW_REMINDER",
    });
    expect(payload.tag).toBe("REVIEW_REMINDER:/dashboard/teacher/questions/review");
    expect(payload.body).toBe("1 question");
  });
});

describe("links and configuration", () => {
  it("builds absolute urls only when given a path", () => {
    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    expect(absoluteUrl()).toBe(origin);
    expect(absoluteUrl("/dashboard/notifications")).toBe(`${origin}/dashboard/notifications`);
    expect(absoluteUrl("https://example.org/x")).toBe("https://example.org/x");
  });

  it("reports push configuration from the VAPID keys", () => {
    expect(pushConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    expect(pushConfigured()).toBe(true);
  });
});
