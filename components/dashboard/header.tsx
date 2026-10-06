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
import {
  Bell,
  LogOut,
  User,
  ChevronDown,
  PanelLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useNotifications, timeAgo } from "@/components/dashboard/use-notifications";
import { metaFor } from "@/components/dashboard/notification-meta";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "School Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

export function DashboardHeader({ avatarUrl }: { avatarUrl?: string | null }) {
  const { data: session, status } = useSession();
  const {
    items,
    unreadCount,
    markRead,
    markAllRead,
    push,
    enablePush,
    disablePush,
    pushBusy,
  } = useNotifications();
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

  async function handleTogglePush() {
    if (push.subscribed) {
      await disablePush();
      toast.success("Browser push notifications turned off.");
      return;
    }
    const ok = await enablePush();
    if (ok) {
      toast.success("Push notifications are on — you'll hear from us even when this tab is closed.");
    } else {
      toast.error(
        push.permission === "denied"
          ? "Notifications are blocked. Allow them for this site in your browser settings."
          : "Could not turn on push notifications."
      );
    }
  }

  const showPushPrompt = push.supported && !push.subscribed;
  const shownItems = items.slice(0, 8);

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
            aria-label="Notifications"
            render={
              <button
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              />
            }
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[9px] font-bold text-primary leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 p-0">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
                <span className="font-[Rasa] text-sm font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-bold text-secondary hover:bg-secondary/25"
                  >
                    Mark all read
                  </button>
                )}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {/* Push opt-in — only shown until the browser is subscribed */}
            {showPushPrompt && (
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                {push.permission === "denied" ? (
                  <p className="font-[Nunito] text-[11px] leading-snug text-muted-foreground">
                    Push notifications are blocked. Allow notifications for this site in your
                    browser settings to get alerted outside this tab.
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-[Nunito] text-[11px] leading-snug text-muted-foreground">
                      Get a browser notification when something is assigned to you — even with
                      this tab closed.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pushBusy}
                      onClick={() => void handleTogglePush()}
                      className="h-7 shrink-0 font-[Nunito] text-[11px]"
                    >
                      {pushBusy ? "Enabling…" : "Turn on"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Notification list */}
            <div className="max-h-80 overflow-y-auto">
              {shownItems.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <p className="font-[Nunito] text-sm font-semibold">No notifications yet</p>
                  <p className="font-[Nunito] text-xs text-muted-foreground mt-1">
                    Questions assigned to you for review will show up here.
                  </p>
                </div>
              )}

              {shownItems.map((item) => {
                const meta = metaFor(item.type);
                const Icon = meta.icon;
                const unread = !item.readAt;
                return (
                  <DropdownMenuItem
                    key={item.id}
                    render={
                      <Link href={item.url ?? "/dashboard/notifications"} />
                    }
                    onClick={() => {
                      if (unread) void markRead(item.id);
                    }}
                    className={`items-start gap-3 rounded-none px-4 py-3 ${
                      unread ? "bg-secondary/5" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
                    >
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-[Nunito] text-sm font-semibold truncate">{item.title}</p>
                        {unread && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                        )}
                      </div>
                      {item.body && (
                        <p className="font-[Nunito] text-xs text-muted-foreground truncate">
                          {item.body}
                        </p>
                      )}
                      <p className="font-[Nunito] text-[10px] text-muted-foreground/70 mt-0.5">
                        {timeAgo(item.createdAt)}
                      </p>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>

            <DropdownMenuSeparator />
            <div className="p-2">
              <Link
                href="/dashboard/notifications"
                className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-[Nunito] text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                View all notifications
              </Link>
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
