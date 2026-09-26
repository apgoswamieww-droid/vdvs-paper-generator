import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
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
    <div className="min-h-screen bg-background">
      {/* Collapsible Sidebar */}
      <DashboardSidebar />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="flex flex-1 flex-col lg:pl-60 transition-all duration-200">
        {/* Top Header */}
        <DashboardHeader avatarUrl={avatarUrl} />

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}