// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({
      authenticated: true,
      redirectTo: user.role === "admin" ? "/admin" : "/dashboard",
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}