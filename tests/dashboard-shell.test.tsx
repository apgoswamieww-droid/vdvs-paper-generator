// @vitest-environment jsdom
// ============================================================
//  Dashboard shell — sidebar collapse vs. content padding.
//
//  Regression: the sidebar was `lg:fixed` with a stateful width
//  (lg:w-16 / lg:w-60) while the content column in the layout hardcoded
//  `lg:pl-60`. Collapsing the sidebar therefore left the content padded to
//  the EXPANDED width — a blank strip where the sidebar used to be, and the
//  page never reclaimed the space. Both sides now read one piece of state
//  from DashboardShell.
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { href?: string; children?: ReactNode; className?: string }) =>
      createElement("a", { href: props.href ?? "#", className: props.className }, props.children),
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "SCHOOL_ADMIN" } } }),
  signOut: () => {},
}));

// No app router in jsdom, so usePathname() would hand back null and the
// nav's isActive() would throw on pathname.startsWith().
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// The header pulls in auth, notifications and Radix menus — none of which
// the padding behaviour depends on.
vi.mock("@/components/dashboard/header", () => ({
  DashboardHeader: () => null,
}));

const { DashboardShell } = await import("@/components/dashboard/dashboard-shell");

const roots: Root[] = [];

async function render(ui: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  roots.push(root);
  return container;
}

/** The content column is the shell's only element carrying data-collapsed. */
function contentColumn(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-collapsed]");
  if (!el) throw new Error("content column not found");
  return el;
}

function sidebarWidth(container: HTMLElement): string | null {
  const aside = container.querySelector("aside");
  return aside?.className.match(/lg:w-(\d+)/)?.[1] ?? null;
}

async function clickCollapse(container: HTMLElement): Promise<void> {
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]'
  );
  if (!toggle) throw new Error("collapse toggle not found");
  await act(async () => {
    toggle.click();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.innerHTML = "";
});

describe("DashboardShell sidebar collapse", () => {
  it("shrinks the content padding to match the collapsed sidebar", async () => {
    const container = await render(<DashboardShell avatarUrl={null}>content</DashboardShell>);

    // Expanded: content pads by the sidebar's expanded width.
    expect(contentColumn(container).className).toContain("lg:pl-60");
    expect(sidebarWidth(container)).toBe("60");

    await clickCollapse(container);

    // The bug: padding stayed at lg:pl-60, leaving a blank strip.
    expect(contentColumn(container).className).toContain("lg:pl-16");
    expect(contentColumn(container).className).not.toContain("lg:pl-60");
    expect(sidebarWidth(container)).toBe("16");
  });

  it("restores the expanded padding when expanded again", async () => {
    const container = await render(<DashboardShell avatarUrl={null}>content</DashboardShell>);

    await clickCollapse(container);
    await clickCollapse(container);

    expect(contentColumn(container).className).toContain("lg:pl-60");
    expect(sidebarWidth(container)).toBe("60");
  });

  it("keeps the padding and the sidebar width equal at every step", async () => {
    const container = await render(<DashboardShell avatarUrl={null}>content</DashboardShell>);

    const pad = (twips: string) => twips.replace("lg:pl-", "");
    const states: [string, string][] = [[contentColumn(container).className, "60"]];

    await clickCollapse(container);
    states.push([contentColumn(container).className, sidebarWidth(container) ?? ""]);

    await clickCollapse(container);
    states.push([contentColumn(container).className, sidebarWidth(container) ?? ""]);

    for (const [className, width] of states) {
      expect(pad(className.match(/lg:pl-(\d+)/)?.[0] ?? "")).toBe(width);
    }
  });

  it("exposes an accessible name and state on the toggle", async () => {
    const container = await render(<DashboardShell avatarUrl={null}>content</DashboardShell>);

    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse sidebar"]'
    );
    expect(collapse?.getAttribute("aria-expanded")).toBe("true");

    await clickCollapse(container);

    const expand = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand sidebar"]'
    );
    expect(expand?.getAttribute("aria-expanded")).toBe("false");
  });
});
