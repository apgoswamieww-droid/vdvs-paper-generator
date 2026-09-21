// Dashboard layout — wraps all /dashboard/* routes
// Add sidebar, navbar, and auth guard here in Phase 2

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar placeholder */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900 md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-6">
          <div className="h-8 w-8 rounded-lg bg-blue-600" />
          <span className="text-lg font-bold text-white">PaperGen</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Papers", href: "/dashboard/papers" },
            { label: "Question Bank", href: "/dashboard/questions" },
            { label: "Taxonomy", href: "/dashboard/taxonomy" },
            { label: "Settings", href: "/dashboard/settings" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
          <h2 className="text-sm font-semibold text-slate-400">Dashboard</h2>
          <div className="h-8 w-8 rounded-full bg-blue-600" />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
