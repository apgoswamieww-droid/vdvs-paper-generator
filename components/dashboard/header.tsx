"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, LogOut, User, ChevronDown, PanelLeft, FileText, CheckCircle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "School Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

const NOTIFICATIONS = [
  {
    id: 1,
    icon: FileText,
    iconColor: "text-secondary",
    iconBg: "bg-secondary/15",
    title: "New paper created",
    desc: "\"Unit 3 - Mathematics\" was saved as draft.",
    time: "2 min ago",
    unread: true,
  },
  {
    id: 2,
    icon: CheckCircle,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/15",
    title: "Paper published",
    desc: "\"Mid-term Science\" is now live.",
    time: "1 hour ago",
    unread: true,
  },
  {
    id: 3,
    icon: FileText,
    iconColor: "text-muted-foreground",
    iconBg: "bg-muted",
    title: "Import completed",
    desc: "45 questions imported to Biology bank.",
    time: "Yesterday",
    unread: false,
  },
];

export function DashboardHeader({ avatarUrl }: { avatarUrl?: string | null }) {
  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length;
  const { data: session, status } = useSession();
  const user = (session?.user ?? null) as Record<string, unknown> | null;
  const name = typeof user?.name === "string" ? user.name : "User";
  const email = typeof user?.email === "string" ? user.email : "";
  const avatarImg = avatarUrl ?? "";
  const role = typeof user?.role === "string" ? user.role : "";
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "User";
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    nameParts.length > 1
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : (name[0] ?? "U").toUpperCase();

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:px-6">
      {/* Left: mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 lg:hidden"
        onClick={() => window.dispatchEvent(new CustomEvent("toggle-sidebar"))}
      >
        <PanelLeft className="h-5 w-5" />
      </Button>

      {/* Left: desktop spacer */}
      <div className="hidden lg:block" />

      {/* Right: notification + profile */}
      <div className="flex items-center gap-2">
        {/* ── Notification Bell Dropdown ── */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" />
            }
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[9px] font-bold text-primary leading-none">
                {unreadCount}
              </span>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 p-0">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
                <span className="font-[Rasa] text-sm font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-bold text-secondary">
                    {unreadCount} new
                  </span>
                )}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {/* Notification list */}
            <div className="max-h-80 overflow-y-auto">
              {NOTIFICATIONS.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer ${
                    n.unread ? "bg-secondary/5" : ""
                  }`}
                >
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.iconBg}`}>
                    <n.icon className={`h-4 w-4 ${n.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-[Nunito] text-sm font-semibold truncate">{n.title}</p>
                      {n.unread && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                      )}
                    </div>
                    <p className="font-[Nunito] text-xs text-muted-foreground truncate">{n.desc}</p>
                    <p className="font-[Nunito] text-[10px] text-muted-foreground/70 mt-0.5">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>

            <DropdownMenuSeparator />
            <div className="p-2">
              <Button variant="ghost" className="w-full justify-center font-[Nunito] text-xs" size="sm">
                View all notifications
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-border" />

        {/* ── Profile Dropdown ── */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors" />
            }
          >
            <Avatar className="h-7 w-7 ring-2 ring-secondary/20">
              <AvatarImage src={avatarImg || undefined} alt={name} />
              <AvatarFallback className="bg-primary text-secondary text-[10px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="font-[Nunito] text-xs font-semibold leading-tight text-foreground truncate">
                {status === "loading" ? "…" : name}
              </span>
              <span className="font-[Nunito] text-[10px] leading-tight text-muted-foreground truncate">
                {status === "loading" ? "…" : email}
              </span>
            </div>
            <ChevronDown className="hidden sm:block h-3 w-3 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 ring-2 ring-secondary/20">
                    <AvatarImage src={avatarImg || undefined} alt={name} />
                    <AvatarFallback className="bg-primary text-secondary text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-[Nunito] text-sm font-semibold">{roleLabel}</p>
                    <p className="font-[Nunito] text-xs text-muted-foreground truncate">{email}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
