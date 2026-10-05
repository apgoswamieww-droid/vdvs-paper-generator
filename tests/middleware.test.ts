import { describe, expect, it, vi } from "vitest";

// The middleware's default export is `auth((req) => …)`. Swapping in a
// pass-through mock for `@/lib/auth` gives us the raw handler without
// loading NextAuth, Prisma or bcrypt.
vi.mock("@/lib/auth", () => ({
  auth: (handler: unknown) => handler,
}));

import middleware from "@/middleware";

// ------------------------------------------------------------------
//  Harness
// ------------------------------------------------------------------

type SessionUser = { role?: string; mustChangePassword?: boolean };
type Session = { user?: SessionUser } | null;

type FakeRequest = {
  nextUrl: URL;
  url: string;
  auth: Session;
};

function makeReq(pathname: string, auth: Session = null): FakeRequest {
  const url = new URL(`http://localhost:3000${pathname}`);
  return { nextUrl: new URL(url.toString()), url: url.toString(), auth };
}

const run = middleware as unknown as (req: FakeRequest) => Response;

/** The location a request redirects to, or null when it passes through. */
function redirectOf(req: FakeRequest): URL | null {
  const res = run(req);
  const loc = res.headers.get("location");
  return loc ? new URL(loc) : null;
}

function passesThrough(pathname: string, auth?: Session): boolean {
  const res = run(makeReq(pathname, auth));
  return res.status >= 200 && res.status < 300 && !res.headers.get("location");
}

function redirectsTo(pathname: string, auth?: Session): URL {
  const target = redirectOf(makeReq(pathname, auth));
  expect(target, `expected ${pathname} to redirect`).toBeTruthy();
  return target as URL;
}

function asUser(role: string, extra: Partial<SessionUser> = {}): Session {
  return { user: { role, ...extra } };
}

// ------------------------------------------------------------------
//  Unauthenticated visitors
// ------------------------------------------------------------------

describe("unauthenticated requests", () => {
  it("redirects protected pages to /login with a callbackUrl", () => {
    const target = redirectsTo("/dashboard/papers");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("callbackUrl")).toBe("/dashboard/papers");
  });

  it("keeps deep paths in callbackUrl", () => {
    const target = redirectsTo("/dashboard/questions/abc123");
    expect(target.searchParams.get("callbackUrl")).toBe("/dashboard/questions/abc123");
  });

  it("lets public paths through", () => {
    for (const p of ["/login", "/register", "/api/auth/session", "/api/health", "/favicon.ico"]) {
      expect(passesThrough(p), `${p} should be public`).toBe(true);
    }
  });
});

// ------------------------------------------------------------------
//  Role homes
// ------------------------------------------------------------------

describe("logged-in landing behavior", () => {
  it.each([
    ["SUPER_ADMIN", "/dashboard/super-admin"],
    ["SCHOOL_ADMIN", "/dashboard"],
    ["TEACHER", "/dashboard/teacher"],
    ["STUDENT", "/dashboard/student"],
  ])("%s visiting / lands on their portal", (role, home) => {
    expect(redirectsTo("/", asUser(role)).pathname).toBe(home);
  });

  it("sends logged-in users hitting /login or /register to their home", () => {
    expect(redirectsTo("/login", asUser("TEACHER")).pathname).toBe("/dashboard/teacher");
    expect(redirectsTo("/register", asUser("STUDENT")).pathname).toBe("/dashboard/student");
  });

  it("passes non-dashboard routes through (session kept)", () => {
    expect(passesThrough("/api/ai/status", asUser("TEACHER"))).toBe(true);
  });

  it("passes dashboard routes for a session without a role (defensive)", () => {
    expect(passesThrough("/dashboard", { user: {} })).toBe(true);
  });
});

// ------------------------------------------------------------------
//  Role boundaries inside /dashboard
// ------------------------------------------------------------------

describe("TEACHER boundaries", () => {
  it("reaches the teacher portal and shared staff areas", () => {
    for (const p of [
      "/dashboard/teacher",
      "/dashboard/teacher/assignments/new",
      "/dashboard/papers",
      "/dashboard/papers/new",
      "/dashboard/questions",
      "/dashboard/taxonomy",
      "/dashboard/settings",
    ]) {
      expect(passesThrough(p, asUser("TEACHER")), `${p} allowed for TEACHER`).toBe(true);
    }
  });

  it("is kept out of admin, student and platform areas", () => {
    for (const p of [
      "/dashboard/admin/users",
      "/dashboard/admin/ai-generator",
      "/dashboard/student",
      "/dashboard/student/exams",
      "/dashboard/super-admin",
    ]) {
      expect(redirectsTo(p, asUser("TEACHER")).pathname).toBe("/dashboard/teacher");
    }
  });
});

describe("SCHOOL_ADMIN boundaries", () => {
  it("reaches school areas including /dashboard/admin", () => {
    for (const p of [
      "/dashboard",
      "/dashboard/papers",
      "/dashboard/questions",
      "/dashboard/taxonomy",
      "/dashboard/settings",
      "/dashboard/admin/users",
      "/dashboard/admin/settings",
    ]) {
      expect(passesThrough(p, asUser("SCHOOL_ADMIN")), `${p} allowed for SCHOOL_ADMIN`).toBe(true);
    }
  });

  it("is kept out of the other portals", () => {
    for (const p of [
      "/dashboard/teacher",
      "/dashboard/teacher/grading",
      "/dashboard/student",
      "/dashboard/super-admin",
    ]) {
      expect(redirectsTo(p, asUser("SCHOOL_ADMIN")).pathname).toBe("/dashboard");
    }
  });
});

describe("SUPER_ADMIN boundaries", () => {
  it("reaches the platform panel and school-level audit views", () => {
    for (const p of [
      "/dashboard/super-admin",
      "/dashboard/admin/users",
      "/dashboard/admin/ai-generator",
      "/dashboard/settings",
    ]) {
      expect(passesThrough(p, asUser("SUPER_ADMIN")), `${p} allowed for SUPER_ADMIN`).toBe(true);
    }
  });

  it("is kept out of ordinary staff areas", () => {
    for (const p of ["/dashboard/papers", "/dashboard/questions", "/dashboard/teacher", "/dashboard/student"]) {
      expect(redirectsTo(p, asUser("SUPER_ADMIN")).pathname).toBe("/dashboard/super-admin");
    }
  });
});

describe("STUDENT boundaries", () => {
  it("reaches only the student portal", () => {
    for (const p of ["/dashboard/student", "/dashboard/student/exams/abc", "/dashboard/student/results"]) {
      expect(passesThrough(p, asUser("STUDENT")), `${p} allowed for STUDENT`).toBe(true);
    }
  });

  it("is kept out of every staff area", () => {
    for (const p of [
      "/dashboard",
      "/dashboard/papers",
      "/dashboard/questions",
      "/dashboard/taxonomy",
      "/dashboard/teacher",
      "/dashboard/admin/users",
      "/dashboard/super-admin",
    ]) {
      expect(redirectsTo(p, asUser("STUDENT")).pathname).toBe("/dashboard/student");
    }
  });
});

// ------------------------------------------------------------------
//  Forced password reset (bulk-imported students)
// ------------------------------------------------------------------

describe("mustChangePassword lock", () => {
  it("funnels every dashboard route to /dashboard/settings?force=1", () => {
    const target = redirectsTo("/dashboard/papers", asUser("STUDENT", { mustChangePassword: true }));
    expect(target.pathname).toBe("/dashboard/settings");
    expect(target.searchParams.get("force")).toBe("1");
  });

  it("still allows the settings page itself", () => {
    expect(passesThrough("/dashboard/settings?force=1", asUser("STUDENT", { mustChangePassword: true }))).toBe(true);
  });

  it("does not leak the settings page as callbackUrl-free public path", () => {
    // Unauthenticated visitors still get bounced to /login normally.
    const target = redirectsTo("/dashboard/settings");
    expect(target.pathname).toBe("/login");
  });
});
