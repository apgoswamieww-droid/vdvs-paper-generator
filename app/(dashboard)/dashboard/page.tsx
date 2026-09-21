import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your SchoolPaperGen control panel.",
};

export default function DashboardPage() {
  const stats = [
    { label: "Total Papers", value: "0", color: "blue" },
    { label: "Questions in Bank", value: "0", color: "purple" },
    { label: "Subjects", value: "0", color: "green" },
    { label: "Teachers", value: "0", color: "orange" },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Good morning 👋</h1>
        <p className="mt-1 text-slate-400">Here&apos;s an overview of your school&apos;s paper generation activity.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className="mt-2 text-4xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/dashboard/papers/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            + Create Paper
          </a>
          <a
            href="/dashboard/questions"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            + Add Question
          </a>
          <a
            href="/dashboard/taxonomy"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Manage Curriculum
          </a>
        </div>
      </div>
    </div>
  );
}
