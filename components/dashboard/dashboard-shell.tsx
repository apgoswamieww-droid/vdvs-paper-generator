"use client";

// ============================================================
//  Dashboard shell — sidebar + content column.
//
//  The sidebar is `lg:fixed`, so the content column has to pad itself by
//  exactly the sidebar's width. That width changes when the sidebar
//  collapses, so the two must share one piece of state: when the sidebar
//  held it alone, collapsing left the content still padded to the expanded
//  width and a blank strip appeared where the sidebar used to be.
//
//  This is a client component so it can hold that state. The layout stays
//  a server component and only passes through the avatar it already loaded.
// ============================================================

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DashboardSidebar } from "./sidebar";
import { DashboardHeader } from "./header";

/** Kept in sync with the sidebar's width classes below. */
const EXPANDED = "lg:pl-60"; // 15rem
const COLLAPSED = "lg:pl-16"; // 4rem

export function DashboardShell({
  avatarUrl,
  children,
}: {
  avatarUrl: string | null;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((o) => !o)}
      />

      {/* Content column — offset by the sidebar's current width. */}
      <div
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "flex flex-1 flex-col transition-all duration-200",
          collapsed ? COLLAPSED : EXPANDED
        )}
      >
        <DashboardHeader avatarUrl={avatarUrl} />

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
