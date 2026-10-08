import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The avatar may be a large self-uploaded data-URL, so it is served from the
  // DB here instead of the session cookie (a big cookie breaks sign-in).
  const session = await getSession();
  let avatarUrl: string | null = null;
  if (session?.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.id },
      select: { avatarUrl: true },
    });
    avatarUrl = me?.avatarUrl ?? null;
  }

  return (
    // The shell is a client component because it owns the sidebar's collapsed
    // state — the content column's padding has to follow the sidebar's width.
    <DashboardShell avatarUrl={avatarUrl}>{children}</DashboardShell>
  );
}