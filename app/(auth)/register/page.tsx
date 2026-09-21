import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register",
  description: "Register your school on SchoolPaperGen and get started for free.",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Register your school</h1>
          <p className="mt-2 text-slate-400">Start generating papers for free today</p>
        </div>

        {/* Registration form — Phase 2 */}
        <div className="space-y-4">
          <div>
            <label htmlFor="school-name" className="mb-1.5 block text-sm font-medium text-slate-300">
              School Name
            </label>
            <input
              id="school-name"
              type="text"
              placeholder="St. Xavier&apos;s High School"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="admin-name" className="mb-1.5 block text-sm font-medium text-slate-300">
              Your Name
            </label>
            <input
              id="admin-name"
              type="text"
              placeholder="Full Name"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              placeholder="admin@school.edu"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              placeholder="Min. 8 characters"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white transition hover:bg-blue-500"
          >
            Create Account
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already registered?{" "}
          <a href="/login" className="text-blue-400 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
