// app/api/auth/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie, clearSession } from "@/lib/auth";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const userData = userDoc.data()!;
    if (userData.status !== "active") {
      return NextResponse.json(
        { error: userData.status === "pending" ? "Account pending approval" : "Account disabled" },
        { status: 403 }
      );
    }

    await setSessionCookie(idToken);

    return NextResponse.json({
      success: true,
      redirectTo: userData.role === "admin" ? "/admin" : "/dashboard",
    });
  } catch (error) {
    console.error("Session creation failed:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ success: true });
}