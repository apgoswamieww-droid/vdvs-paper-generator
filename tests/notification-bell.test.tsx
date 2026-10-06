// @vitest-environment jsdom
// ============================================================
//  Notification feed UI — the header bell and the
//  /dashboard/notifications page share this list component:
//  unread counts, the unread filter, mark-one and mark-all-read.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NotificationsClient } from "@/app/(dashboard)/dashboard/notifications/notifications-client";
import { metaFor } from "@/components/dashboard/notification-meta";
import type { FeedItem } from "@/components/dashboard/use-notifications";

// react-dom/client refuses to render outside an act()-aware environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// next/link needs a mounted app router; an anchor keeps the markup (and
// click handling) the same without pulling the whole router into jsdom.
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: {
      href?: string;
      className?: string;
      children?: ReactNode;
      onClick?: (event: { preventDefault: () => void }) => void;
    }) =>
      createElement(
        "a",
        {
          href: props.href ?? "#",
          className: props.className,
          onClick: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            props.onClick?.(event);
          },
        },
        props.children
      ),
  };
});

const UNREAD: FeedItem = {
  id: "n1",
  type: "QUESTION_ASSIGNED",
  title: "3 questions assigned to you",
  body: "Unit 3 — Mathematics",
  url: "/dashboard/teacher/questions/review",
  readAt: null,
  createdAt: new Date(Date.now() - 10_000).toISOString(),
};

const READ: FeedItem = {
  id: "n2",
  type: "QUESTION_REVIEWED",
  title: "Question approved",
  body: "Reflection of light",
  url: "/dashboard/questions",
  readAt: new Date().toISOString(),
  createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
};

const roots: { root: Root; container: HTMLElement }[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

async function render(ui: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  roots.push({ root, container });
  return container;
}

async function click(element: Element | null | undefined): Promise<void> {
  if (!element) throw new Error("element not found");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function button(container: HTMLElement, label: string): Element | undefined {
  return [...container.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === label
  );
}

function rowLink(container: HTMLElement, title: string): Element | undefined {
  return [...container.querySelectorAll("a")].find((a) =>
    (a.textContent ?? "").includes(title)
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notification type metadata", () => {
  it("labels every known event and falls back safely", () => {
    expect(metaFor("QUESTION_ASSIGNED").label).toBe("Assigned for review");
    expect(metaFor("QUESTION_REVIEWED").label).toBe("Review finished");
    expect(metaFor("QUESTION_UNASSIGNED").label).toBe("Needs a reviewer");
    expect(metaFor("REVIEW_REMINDER").label).toBe("Reminder");
    expect(metaFor("SOMETHING_NEW").label).toBe("Notification");
  });
});

describe("NotificationsClient", () => {
  it("renders titles, bodies, channel labels and relative times", async () => {
    const container = await render(
      <NotificationsClient
        initialItems={[UNREAD, READ]}
        initialUnread={1}
        initialTotal={2}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("3 questions assigned to you");
    expect(text).toContain("Unit 3 — Mathematics");
    expect(text).toContain("Assigned for review");
    expect(text).toContain("just now");
    expect(text).toContain("Question approved");
    expect(text).toContain("Review finished");
    expect(text).toContain("3 hours ago");
    expect(button(container, "All (2)")).toBeTruthy();
    expect(button(container, "Unread (1)")).toBeTruthy();
  });

  it("filters down to unread items only", async () => {
    const container = await render(
      <NotificationsClient
        initialItems={[UNREAD, READ]}
        initialUnread={1}
        initialTotal={2}
      />
    );
    await click(button(container, "Unread (1)"));
    expect(container.textContent).toContain("3 questions assigned to you");
    expect(container.textContent).not.toContain("Question approved");

    await click(button(container, "All (2)"));
    expect(container.textContent).toContain("Question approved");
  });

  it("marks a single notification read when its row is clicked", async () => {
    const container = await render(
      <NotificationsClient
        initialItems={[UNREAD, READ]}
        initialUnread={1}
        initialTotal={2}
      />
    );
    await click(rowLink(container, "3 questions assigned to you"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/read",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "n1" }) })
    );
    expect(button(container, "Unread (0)")).toBeTruthy();

    // The unread filter now has nothing to show.
    await click(button(container, "Unread (0)"));
    expect(container.textContent).toContain("You're all caught up");
    expect(container.textContent).not.toContain("3 questions assigned to you");
  });

  it("marks everything read at once", async () => {
    const container = await render(
      <NotificationsClient
        initialItems={[UNREAD, READ]}
        initialUnread={1}
        initialTotal={2}
      />
    );
    await click(button(container, "Mark all as read"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/read",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ all: true }) })
    );
    expect(button(container, "Unread (0)")).toBeTruthy();
    expect(button(container, "Mark all as read")).toBeUndefined();
  });

  it("shows an empty state instead of a blank card", async () => {
    const container = await render(
      <NotificationsClient initialItems={[]} initialUnread={0} initialTotal={0} />
    );
    expect(container.textContent).toContain("No notifications yet");
  });
});
