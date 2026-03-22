// middleware.ts
// EDGE RUNTIME — must NEVER import firebase-admin or any Node.js-only module.
// Only uses: next/server, lib/constants (no transitive Node deps)
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",
  "/favicon.ico",
  "/_next",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through without any auth check
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ Only checks cookie existence here — never touches firebase-admin.
  // Full role/status verification happens inside each server action and
  // server component via requireAuth() / requireAdmin() (Node.js runtime).
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
