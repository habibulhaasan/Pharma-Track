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

  // No cookie at all — simple cases, no verification needed
  if (!sessionCookie) {
    if (AUTH_PAGES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Has a cookie — verify it by calling /api/auth/me (runs on Node.js, can use firebase-admin)
  // Any failure here (network error, non-JSON response such as a Vercel protection
  // page, a 500 from missing env vars) is treated as "not authenticated" instead of
  // crashing the middleware with MIDDLEWARE_INVOCATION_FAILED.
  let authenticated = false;
  let redirectTo: string | undefined;
  try {
    const verifyUrl = new URL("/api/auth/me", request.url);
    const verifyRes = await fetch(verifyUrl, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` },
      cache: "no-store",
    });
    const contentType = verifyRes.headers.get("content-type") ?? "";
    if (verifyRes.ok && contentType.includes("application/json")) {
      const body = await verifyRes.json();
      authenticated = !!body?.authenticated;
      redirectTo = body?.redirectTo;
    } else {
      console.error("middleware: /api/auth/me returned", verifyRes.status, contentType);
    }
  } catch (err) {
    console.error("middleware: auth verification failed", err);
  }

  if (AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    if (authenticated) {
      return NextResponse.redirect(new URL(redirectTo ?? "/dashboard", request.url));
    }
    // Not authenticated — clear the stale cookie and show login
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Protected route
  if (!authenticated) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME); // clear stale cookie so loop can't happen
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};