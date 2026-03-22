// lib/auth.ts
import "server-only";
import { cookies } from "next/headers";
import { getAdminDb, verifyIdTokenCookie } from "./firebaseAdmin";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "./constants";

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };

export async function setSessionCookie(idToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, idToken, {
    maxAge: 55 * 60,
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

  if (!idToken) {
    console.log("[getCurrentUser] no token in cookie");
    return null;
  }

  console.log("[getCurrentUser] verifying token...");
  const verified = await verifyIdTokenCookie(idToken);
  
  if (!verified) {
    console.log("[getCurrentUser] verifyIdTokenCookie returned null");
    return null;
  }

  console.log("[getCurrentUser] verified uid:", verified.uid);

  const userDoc = await getAdminDb()
    .collection("users")
    .doc(verified.uid)
    .get();

  if (!userDoc.exists) {
    console.log("[getCurrentUser] user doc not found in Firestore");
    return null;
  }

  const data = userDoc.data()!;
  console.log("[getCurrentUser] user status:", data.status, "role:", data.role);

  if (data.status !== "active") {
    console.log("[getCurrentUser] user not active, status:", data.status);
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
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}