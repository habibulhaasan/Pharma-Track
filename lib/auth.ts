// lib/auth.ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminDb, verifyIdTokenCookie } from "./firebaseAdmin";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "./constants";

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };

export async function setSessionCookie(idToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, idToken, {
    maxAge: 60 * 60 * 24 * 14,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const idToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!idToken) return null;

  const verified = await verifyIdTokenCookie(idToken);

  if (!verified) {
    // Token expired or invalid — clear the cookie so middleware stops looping
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const userDoc = await getAdminDb()
    .collection("users")
    .doc(verified.uid)
    .get();

  if (!userDoc.exists) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const data = userDoc.data()!;

  if (data.status !== "active") {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  return {
    id: verified.uid,
    name: data.name as string,
    email: data.email as string,
    phone: data.phone as string,
    role: data.role as "admin" | "user",
    status: data.status as string,
  };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}