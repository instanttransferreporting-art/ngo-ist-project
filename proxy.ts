import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const normalizedPath = pathname.startsWith("/dashboard/")
    ? pathname.replace("/dashboard", "")
    : pathname;
  const isUserTemplatePreferencePath = /^\/api\/users\/[^/]+\/template-preference$/.test(pathname);

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets & Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Protect cron routes — must come from Vercel (Authorization header)
  if (pathname.startsWith("/api/cron")) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next();
    }

    // Also allow authenticated admins to trigger cron endpoints manually from UI.
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // All other routes require a valid session
  const session = await getSessionFromRequest(req);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Guard admin routes
  if (
    (normalizedPath.startsWith("/admin") ||
      (pathname.startsWith("/api/users") && !isUserTemplatePreferencePath) ||
      pathname.startsWith("/api/lock") ||
      (pathname.startsWith("/api/leaves") &&
        req.method !== "GET" &&
        req.method !== "POST")) &&
    session.role !== "ADMIN"
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/employee", req.url));
  }

  // Redirect role to correct dashboard
  if (pathname === "/dashboard") {
    return NextResponse.redirect(
      new URL(
        session.role === "ADMIN" ? "/admin" : "/employee",
        req.url
      )
    );
  }

  // Legacy compatibility for old links (/dashboard/*)
  if (normalizedPath !== pathname) {
    return NextResponse.redirect(new URL(normalizedPath, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
