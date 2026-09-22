import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = !!session;
  const userRole = (session?.user as any)?.role as string | undefined;

  // Public routes that don't need auth
  const publicPaths = ["/login", "/register", "/api/auth", "/api/health", "/_next", "/favicon.ico"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // If logged in and hitting login/register, redirect to role dashboard
    if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
      if (userRole === "STUDENT") return NextResponse.redirect(new URL("/dashboard/student", req.url));
      return NextResponse.redirect(new URL("/dashboard/teacher", req.url));
    }
    return NextResponse.next();
  }

  // Not logged in — redirect to login
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based route protection
  if (userRole === "STUDENT" && pathname.startsWith("/dashboard/teacher")) {
    return NextResponse.redirect(new URL("/dashboard/student", req.url));
  }
  if (userRole === "TEACHER" && pathname.startsWith("/dashboard/student")) {
    return NextResponse.redirect(new URL("/dashboard/teacher", req.url));
  }
  if (userRole === "SCHOOL_ADMIN" && (pathname.startsWith("/dashboard/teacher") || pathname.startsWith("/dashboard/student"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Logged in but on generic /dashboard — redirect to role-specific
  if (pathname === "/dashboard") {
    if (userRole === "STUDENT") return NextResponse.redirect(new URL("/dashboard/student", req.url));
    if (userRole === "TEACHER") return NextResponse.redirect(new URL("/dashboard/teacher", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all paths except static files and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
