import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

type Role = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STUDENT";

// Each role's landing page when they hit the generic dashboard or a forbidden route.
const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/dashboard/super-admin",
  SCHOOL_ADMIN: "/dashboard",
  TEACHER: "/dashboard/teacher",
  STUDENT: "/dashboard/student",
};

// Tenant staff areas that both TEACHER and SCHOOL_ADMIN may access.
const STAFF_AREAS = [
  "/dashboard/papers",
  "/dashboard/questions",
  "/dashboard/taxonomy",
  "/dashboard/settings",
];

function isAllowed(pathname: string, role: Role): boolean {
  // Personal account settings are available to every signed-in role.
  if (pathname.startsWith("/dashboard/settings")) return true;

  switch (role) {
    case "SUPER_ADMIN":
      // Platform owner — the SaaS control panel, plus school-level
      // audit views (tenant filter is derived per page, never trusted from input).
      return (
        pathname.startsWith("/dashboard/super-admin") ||
        pathname.startsWith("/dashboard/admin")
      );
    case "SCHOOL_ADMIN":
      // Any dashboard area EXCEPT the platform panel and the other portals.
      return (
        pathname.startsWith("/dashboard") &&
        !pathname.startsWith("/dashboard/super-admin") &&
        !pathname.startsWith("/dashboard/teacher") &&
        !pathname.startsWith("/dashboard/student")
      );
    case "TEACHER":
      // Teacher portal + shared staff areas (papers, questions, taxonomy).
      return (
        pathname.startsWith("/dashboard/teacher") ||
        STAFF_AREAS.some((p) => pathname.startsWith(p))
      );
    case "STUDENT":
      return pathname.startsWith("/dashboard/student");
  }
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = (req.auth?.user as { role?: Role } | undefined)?.role;

  // Public routes
  const publicPaths = [
    "/login",
    "/register",
    "/api/auth",
    "/api/health",
    "/api/app/init", // mobile boot check — version gates + maintenance flag
    "/_next",
    "/favicon.ico",
  ];
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p));

  // Not logged in
  if (!isLoggedIn) {
    if (isPublic) return NextResponse.next();
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged in — derive home for this role
  const home = role ? ROLE_HOME[role] : "/dashboard";

  // Logged-in users visiting auth pages → their home
  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.redirect(new URL(home, req.url));
  }

  // Non-dashboard routes outside the app (e.g. landing page) — keep the session
  if (!pathname.startsWith("/dashboard")) {
    if (pathname === "/") return NextResponse.redirect(new URL(home, req.url));
    return NextResponse.next();
  }

  // Bulk-imported students must set their own password before anything
  // else — every dashboard route except the settings page is blocked.
  // Checked before role boundaries so the funnel takes a single hop.
  const mustChangePassword =
    (req.auth?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword === true;
  if (mustChangePassword && !pathname.startsWith("/dashboard/settings")) {
    return NextResponse.redirect(new URL("/dashboard/settings?force=1", req.url));
  }

  // Enforce strict role boundaries inside the dashboard
  if (role && !isAllowed(pathname, role)) {
    return NextResponse.redirect(new URL(home, req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all paths except static files and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};