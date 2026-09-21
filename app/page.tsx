import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <div className="text-center space-y-6 px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 backdrop-blur-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          Multi-Tenant SaaS — School Edition
        </div>

        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
          School
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            PaperGen
          </span>
        </h1>

        <p className="mx-auto max-w-xl text-lg text-slate-400">
          Create, manage, and distribute custom exam papers effortlessly.
          Powered by a rich question bank and built for every school.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="rounded-lg bg-blue-500 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400 hover:shadow-blue-400/30"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
