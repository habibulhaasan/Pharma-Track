// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

const PUBLIC_PATHS = ["/register", "/api/auth", "/favicon.ico", "/_next"];
const AUTH_PAGES = ["/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    if (sessionCookie) {
      // Verify the cookie is actually valid before redirecting
      try {
        const { verifySessionCookie } = await import("@/lib/firebaseAdmin");
        const verified = await verifySessionCookie(sessionCookie);
        if (verified) {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      } catch {
        // Cookie is invalid — clear it and let them stay on login
        const response = NextResponse.next();
        response.cookies.delete(SESSION_COOKIE_NAME);
        return response;
      }
    }
    return NextResponse.next();
  }

  // Protected routes
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validate cookie on protected routes too
  try {
    const { verifySessionCookie } = await import("@/lib/firebaseAdmin");
    const verified = await verifySessionCookie(sessionCookie);
    if (!verified) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};