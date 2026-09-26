"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  FileText,
  HelpCircle,
  FolderTree,
  Settings,
  PanelLeftClose,
  PanelLeft,
  GraduationCap,
  Building2,
  Users,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  PenLine,
  Award,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Papers", href: "/dashboard/papers", icon: FileText },
  { label: "Question Bank", href: "/dashboard/questions", icon: HelpCircle },
  { label: "Curriculum", href: "/dashboard/taxonomy", icon: FolderTree },
] as const;

const TEACHER_ITEMS = [
  { label: "Dashboard", href: "/dashboard/teacher", icon: LayoutDashboard },
  { label: "Papers", href: "/dashboard/papers", icon: FileText },
  { label: "Question Bank", href: "/dashboard/questions", icon: HelpCircle },
  { label: "Curriculum", href: "/dashboard/taxonomy", icon: FolderTree },
  { label: "Assignments", href: "/dashboard/teacher/assignments", icon: ClipboardList },
  { label: "Grading", href: "/dashboard/teacher/grading", icon: PenLine },
  { label: "Submissions", href: "/dashboard/teacher/submissions", icon: FileCheck },
  { label: "Review Questions", href: "/dashboard/teacher/questions/review", icon: ClipboardCheck },
] as const;

const STUDENT_ITEMS = [
  { label: "Dashboard", href: "/dashboard/student", icon: LayoutDashboard },
  { label: "My Exams", href: "/dashboard/student/exams", icon: ClipboardList },
  { label: "My Results", href: "/dashboard/student/results", icon: Award },
] as const;

const SCHOOL_ADMIN_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Users & Staff", href: "/dashboard/admin/users", icon: Users },
  { label: "Classes & Sections", href: "/dashboard/admin/classes", icon: GraduationCap },
  { label: "AI Generator", href: "/dashboard/admin/ai-generator", icon: Sparkles },
  { label: "Papers", href: "/dashboard/papers", icon: FileText },
  { label: "Question Bank", href: "/dashboard/questions", icon: HelpCircle },
  { label: "Curriculum", href: "/dashboard/taxonomy", icon: FolderTree },
] as const;

const SUPER_ADMIN_ITEMS = [
  { label: "Platform", href: "/dashboard/super-admin", icon: Building2 },
] as const;

// Personal account settings — reachable by every signed-in role (see middleware.ts).
const BOTTOM_NAV_ITEMS = [
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
] as const;

// Role home pages must match exactly, otherwise the generic `startsWith` check in
// isActive() would also light up "Dashboard" while a nested page like
// /dashboard/teacher/grading is open.
const EXACT_MATCH_HREFS = new Set([
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/super-admin",
  "/dashboard/teacher",
  "/dashboard/student",
]);

const SCHOOL_ADMIN_BOTTOM_ITEMS = [
  { label: "School Settings", href: "/dashboard/admin/settings", icon: Settings },
] as const;

function SidebarContent({
  collapsed,
  onNavClick,
}: {
  collapsed?: boolean;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  let navItems: ReadonlyArray<{ label: string; href: string; icon: LucideIcon }> = NAV_ITEMS;
  let bottomNavItems: ReadonlyArray<{ label: string; href: string; icon: LucideIcon }> =
    BOTTOM_NAV_ITEMS;
  if (role === "SUPER_ADMIN") {
    navItems = SUPER_ADMIN_ITEMS;
  } else if (role === "SCHOOL_ADMIN") {
    navItems = SCHOOL_ADMIN_ITEMS;
    bottomNavItems = SCHOOL_ADMIN_BOTTOM_ITEMS;
  } else if (role === "TEACHER") {
    navItems = TEACHER_ITEMS;
  } else if (role === "STUDENT") {
    navItems = STUDENT_ITEMS;
  }

  function isActive(href: string) {
    if (EXACT_MATCH_HREFS.has(href)) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4 transition-all duration-200",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary ring-1 ring-secondary/20">
          <GraduationCap className="h-4.5 w-4.5 text-secondary" />
        </div>
        {!collapsed && (
          <span className="font-[Rasa] text-sm font-bold tracking-tight text-sidebar-foreground">
            PaperGen
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 font-[Nunito] text-sm font-medium transition-all duration-150",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  "h-4.5 w-4.5 shrink-0 transition-colors",
                  active
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/80"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      {bottomNavItems.length > 0 && (
        <div className="border-t border-sidebar-border px-3 py-4 space-y-1">
          {bottomNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 font-[Nunito] text-sm font-medium transition-all duration-150",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  "h-4.5 w-4.5 shrink-0 transition-colors",
                  active
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/80"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
}

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMobileOpen((o) => !o);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-30 border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "lg:w-16" : "lg:w-60"
        )}
      >
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/60 shadow-md transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? <PanelLeft className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile — opened from header toggle, rendered as full overlay */}
      <div className="lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-60 p-0 bg-sidebar border-sidebar-border">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
